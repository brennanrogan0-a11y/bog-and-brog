const SUPABASE_URL = "https://hdeygxixsjhpksbskykn.supabase.co";
const SUPABASE_KEY = "sb_publishable_pY7T4eppbUfXUsn0oJj7jg_ZLZYfwlb";

const $ = (id) => document.getElementById(id);

let db;
let user = null;
let canWrite = false;
let editingEntry = null;
let entries = [];
let previewUrls = [];
let offset = 0;

const pageSize = 10;

function showStatus(text = "", error = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", error);
}

function localDate() {
    const date = new Date();

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function photoUrl(path) {
    return db.storage
        .from("journal-photos")
        .getPublicUrl(path)
        .data.publicUrl;
}

function clearPreviews() {
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    previewUrls = [];
    $("photo-preview").replaceChildren();
}

function makePreview(src, alt) {
    const image = document.createElement("img");
    image.src = src;
    image.alt = alt;
    $("photo-preview").append(image);
}

function closeEditor() {
    editingEntry = null;
    clearPreviews();
    $("entry-form").reset();
    $("editor-panel").hidden = true;
}

function openEditor(entry = null) {
    if (!canWrite) return;

    closeEditor();
    editingEntry = entry;

    $("editor-heading").textContent = entry
        ? "Amend the official record."
        : "What happened this time?";

    $("title").value = entry?.title || "";
    $("entry-date").value = entry?.entry_date || localDate();
    $("location").value = entry?.location || "";
    $("story").value = entry?.story || "";

    $("publish-button").textContent = entry
        ? "Save changes"
        : "Add to the record";

    (entry?.photos || []).forEach((path, index) => {
        makePreview(photoUrl(path), `Existing photo ${index + 1}`);
    });

    $("editor-panel").hidden = false;
    $("editor-panel").scrollIntoView({ behavior: "smooth" });
    $("title").focus();
}

function renderEntries() {
    const container = $("entries");
    container.replaceChildren();

    if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const title = document.createElement("h3");
        title.textContent = "Suspiciously little evidence.";

        const text = document.createElement("p");
        text.textContent = canWrite
            ? "Document your first incident. We need details."
            : "Nothing to report. Yet.";

        empty.append(title, text);
        container.append(empty);
        return;
    }

    entries.forEach((entry) => {
        const article = document.createElement("article");
        article.className = "entry";

        const meta = document.createElement("div");
        meta.className = "entry-meta";

        const details = document.createElement("span");
        const date = new Date(entry.entry_date + "T12:00:00");

        details.textContent = date.toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric"
        });

        if (entry.location) {
            details.textContent += ` · ${entry.location}`;
        }

        meta.append(details);

        if (canWrite) {
            const edit = document.createElement("button");
            edit.className = "text-button";
            edit.textContent = "Amend the record";
            edit.addEventListener("click", () => openEditor(entry));
            meta.append(edit);
        }

        const heading = document.createElement("h3");
        heading.textContent = entry.title;

        const photos = document.createElement("div");
        photos.className = "entry-photos";

        entry.photos.forEach((path, index) => {
            const link = document.createElement("a");
            link.href = photoUrl(path);
            link.target = "_blank";
            link.rel = "noopener";

            const image = document.createElement("img");
            image.src = link.href;
            image.alt = `${entry.title} — photo ${index + 1}`;
            image.loading = "lazy";

            link.append(image);
            photos.append(link);
        });

        const story = document.createElement("div");
        story.className = "entry-story";
        story.textContent = entry.story;

        article.append(meta, heading, photos, story);
        container.append(article);
    });
}

async function loadEntries(reset = false) {
    $("more-button").disabled = true;

    try {
        const start = reset ? 0 : offset;

        const { data, error, count } = await db
            .from("entries")
            .select("*", { count: "exact" })
            .order("entry_date", { ascending: false })
            .order("id", { ascending: false })
            .range(start, start + pageSize - 1);

        if (error) throw error;

        entries = reset ? data : [...entries, ...data];
        offset = start + data.length;

        $("entry-count").textContent =
            `${count} ${count === 1 ? "incident" : "incidents"}`;

        $("more-button").hidden = offset >= count;

        renderEntries();
    } finally {
        $("more-button").disabled = false;
    }
}

async function updateAccount() {
    const { data, error } = await db.auth.getUser();

    user = error ? null : data.user;
    canWrite = false;

    if (user) {
        const result = await db
            .from("journal_editors")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (result.error) throw result.error;

        canWrite = Boolean(result.data);
    }

    $("account-button").hidden = Boolean(user);
    $("signout-button").hidden = !user;
    $("new-button").hidden = !canWrite;

    if (!canWrite) closeEditor();

    renderEntries();
}

$("account-button").addEventListener("click", () => {
    $("login-panel").hidden = false;
    $("email").focus();
});

$("close-login").addEventListener("click", () => {
    $("login-panel").hidden = true;
});

$("new-button").addEventListener("click", () => openEditor());

$("cancel-button").addEventListener("click", closeEditor);

$("photos").addEventListener("change", () => {
    clearPreviews();

    (editingEntry?.photos || []).forEach((path, index) => {
        makePreview(photoUrl(path), `Existing photo ${index + 1}`);
    });

    [...$("photos").files].forEach((file) => {
        const url = URL.createObjectURL(file);
        previewUrls.push(url);
        makePreview(url, file.name);
    });
});

$("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!db) return;

    const button = event.submitter;
    button.disabled = true;

    try {
        const { error } = await db.auth.signInWithPassword({
            email: $("email").value.trim(),
            password: $("password").value
        });

        if (error) throw error;

        await updateAccount();

        $("password").value = "";
        $("login-panel").hidden = true;

        showStatus(
            canWrite
                ? "Welcome back. Try to keep the facts straight."
                : "Signed in, but this account does not have posting access."
        );
    } catch (error) {
        showStatus(error.message, true);
    } finally {
        button.disabled = false;
    }
});

$("signout-button").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();

    if (error) {
        showStatus(error.message, true);
        return;
    }

    await updateAccount();
    showStatus("Clocked out. Stay out of trouble.");
});

$("more-button").addEventListener("click", async () => {
    try {
        await loadEntries();
    } catch (error) {
        showStatus(error.message, true);
    }
});

$("entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!canWrite) return;

    const button = $("publish-button");
    const files = [...$("photos").files];
    const existingPhotos = editingEntry?.photos || [];
    const uploaded = [];
    const isEditing = Boolean(editingEntry);

    let saved = false;

    button.disabled = true;
    $("cancel-button").disabled = true;

    try {
        if (files.length + existingPhotos.length > 12) {
            throw new Error("Please use no more than 12 photos per entry.");
        }

        if (!files.length && !existingPhotos.length) {
            throw new Error("We need evidence. Please choose at least one photo.");
        }

        const extensions = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp"
        };

        for (const file of files) {
            if (!extensions[file.type]) {
                throw new Error("Please use JPEG, PNG, or WebP images.");
            }

            if (file.size > 10 * 1024 * 1024) {
                throw new Error(`${file.name} is larger than 10 MB.`);
            }
        }

        const title = $("title").value.trim();
        const story = $("story").value.trim();

        if (!title || !story) {
            throw new Error("Every incident needs a title and a version of events.");
        }

        for (let index = 0; index < files.length; index++) {
            showStatus(
                `Filing photographic evidence ${index + 1} of ${files.length}…`
            );

            const file = files[index];

            const path =
                `${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;

            const { error } = await db.storage
                .from("journal-photos")
                .upload(path, file, {
                    contentType: file.type,
                    upsert: false
                });

            if (error) throw error;

            uploaded.push(path);
        }

        const entry = {
            title,
            story,
            entry_date: $("entry-date").value,
            location: $("location").value.trim(),
            photos: [...existingPhotos, ...uploaded]
        };

        let result;

        if (editingEntry) {
            result = await db
                .from("entries")
                .update(entry)
                .eq("id", editingEntry.id)
                .select()
                .single();
        } else {
            result = await db
                .from("entries")
                .insert(entry)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        saved = true;
        closeEditor();

        showStatus(
            isEditing
                ? "The official record has been amended."
                : "Incident added to the record."
        );

        await loadEntries(true);
    } catch (error) {
        if (!saved && uploaded.length) {
            const cleanup = await db.storage
                .from("journal-photos")
                .remove(uploaded);

            if (cleanup.error) {
                console.error("Upload cleanup failed:", cleanup.error);
            }
        }

        showStatus(
            saved
                ? "Entry saved, but the journal could not refresh. Reload the page."
                : error.message,
            true
        );
    } finally {
        button.disabled = false;
        $("cancel-button").disabled = false;
    }
});

async function start() {
    if (
        SUPABASE_URL.includes("PASTE_") ||
        SUPABASE_KEY.includes("PASTE_")
    ) {
        showStatus(
            "Add your Supabase URL and publishable key in blog.js to connect the journal."
        );

        renderEntries();
        return;
    }

    try {
        db = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

        await updateAccount();
        await loadEntries(true);
    } catch (error) {
        showStatus(error.message, true);
    }
}

start();
