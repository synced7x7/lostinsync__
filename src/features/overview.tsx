import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, FolderPlus, ImagePlus, PenLine, Plus, Sparkles, X } from "lucide-react";
import type { AppData, Collection, Game } from "../domain/game";
import { seedGame } from "./discover";
import "./overview.css";

export function ProfileSection({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const [editing, setEditing] = useState(false);
  const [pictureError, setPictureError] = useState("");
  const [displayName, setDisplayName] = useState(data.profile.displayName);
  const [bio, setBio] = useState(data.profile.bio);
  const pictureInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDisplayName(data.profile.displayName);
      setBio(data.profile.bio);
    }
  }, [data.profile.displayName, data.profile.bio, editing]);

  const finishEditing = () => {
    if (displayName !== data.profile.displayName || bio !== data.profile.bio) {
      update({ ...data, profile: { ...data.profile, displayName, bio } });
    }
    setEditing(false);
  };

  const updatePicture = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPictureError("Choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 512;
        const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        update({ ...data, profile: { ...data.profile, picture: canvas.toDataURL("image/jpeg", 0.86) } });
        setPictureError("");
      };
      image.onerror = () => setPictureError("The selected image could not be decoded.");
      image.src = String(reader.result);
    };
    reader.onerror = () => setPictureError("The selected image could not be read.");
    reader.readAsDataURL(file);
  };

  return (
    <>
      <section className="profile-banner glass">
        <button
          className="profile-edit button soft"
          onClick={() => editing ? finishEditing() : setEditing(true)}
        >
          <PenLine size={16} /> {editing ? "Done" : ""}
        </button>
        <button
          type="button"
          className={`profile-avatar${editing ? " editable" : ""}`}
          onClick={() => editing && pictureInput.current?.click()}
          title={editing ? "Change profile picture" : undefined}
        >
          {data.profile.picture
            ? <img src={data.profile.picture} alt={`${data.profile.displayName} profile`} />
            : data.profile.displayName.slice(0, 1)}
          {editing && <span className="profile-avatar-action"><Camera size={16} /></span>}
        </button>
        <input
          ref={pictureInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            updatePicture(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="profile-copy">
          {editing
            ? <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            : <h2>{data.profile.displayName}</h2>}
          {editing
            ? <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
            : <p>{data.profile.bio}</p>}
          <span className="pill"><Sparkles size={13} /> Local collector</span>
          {pictureError && <span className="date-error">{pictureError}</span>}
        </div>
        <div className="profile-count"><strong>{data.games.length}</strong><span>games collected</span></div>
      </section>
    </>
  );
}

// IGDB covers are stored as small sizes; request the 2x cover so they stay sharp
const hq = (url?: string) => url?.replace(/t_(thumb|micro|cover_small|cover_big|logo_med|screenshot_med|720p)\b/, "t_cover_big_2x");
// crops to 3:4 and stores at 384x512, so custom art is small and matches the card shape
const cropCover = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const W = 384, H = 512;
        const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const sw = W / s, sh = H / s;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        c.getContext("2d")?.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => rej(new Error("decode"));
      img.src = String(r.result);
    };
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(file);
  });

const collectionArt = (c: Collection) => c.image ?? hq(c.items[0]?.cover);

function CollectionImagePicker({ value, fallback, onChange }: { value?: string; fallback?: string; onChange: (v?: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const shown = value ?? fallback;
  return (
    <div className="collection-image-edit">
      <div className="collection-image-preview">{shown ? <img src={shown} alt="" /> : <ImagePlus size={20} />}</div>
      <div className="collection-image-actions">
        <button type="button" className="button soft" onClick={() => input.current?.click()}>
          <ImagePlus size={15} /> {value ? "Change image" : "Choose image"}
        </button>
        {value && <button type="button" className="button soft" onClick={() => onChange(undefined)}>Use first game's cover</button>}
        <small>{value ? "Custom image" : fallback ? "Using the first game's cover" : "Optional"}</small>
        {err && <span className="date-error">{err}</span>}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try { onChange(await cropCover(f)); setErr(""); } catch { setErr("That image could not be read."); }
          }}
        />
      </div>
    </div>
  );
}

export function CollectionShowcase({ data, update, openGame, openDiscover }: { data: AppData; update: (data: AppData) => void; openGame: (id: string) => void; openDiscover: (id: number) => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const collections = data.collections ?? [];
  const current = collections.find((c) => c.id === selectedId); // always fresh after edits
  return (
    <section className="collections-panel glass">
      <div className="collections-heading">
        <div><p className="eyebrow">PERSONAL CURATION</p><h2>Collections</h2></div>
        <span className="collections-count">{collections.length}</span>
      </div>
      {collections.length === 0 ? (
        <p className="muted">Create collections from any game detail page.</p>
      ) : (
        <div className="collection-showcase-row">
          {collections.map((c) => (
            <button type="button" className="collection-card" key={c.id} onClick={() => setSelectedId(c.id)}>
              <div className={`collection-poster${collectionArt(c) ? "" : " empty"}`}>
                {collectionArt(c)
                  ? <img src={collectionArt(c)} alt="" loading="lazy" decoding="async" draggable={false} />
                  : <Plus size={26} />}
                <div className="collection-poster-info">
                  <strong>{c.name}</strong>
                  <small>{c.items.length} games</small>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {current && <CollectionDetail collection={current} data={data} update={update} openDiscover={openDiscover} close={() => setSelectedId(undefined)} />}
    </section>
  );
}

function CollectionDetail({ collection, data, update, openDiscover, close }: { collection: Collection; data: AppData; update: (data: AppData) => void; openDiscover: (id: number) => void; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const save = () => {
    update({ ...data, collections: (data.collections ?? []).map((item) => item.id === collection.id ? { ...item, name: name.trim() || item.name, description: description.trim() } : item) });
    setEditing(false);
  };
  return createPortal(
    <div className="modal-backdrop collection-backdrop" onClick={close}>
      <div className="modal collection-modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><p className="eyebrow">PERSONAL CURATION</p><h2>{editing ? "Edit collection" : collection.name}</h2></div>
          <button className="icon-btn" onClick={close} aria-label="Close collection"><X size={18} /></button>
        </div>
        {editing ? (
          <div className="collection-edit-form">
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
            <label>Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 180))} maxLength={180} placeholder="Describe this collection (180 characters max)" />
              <small>{description.length}/180</small>
            </label>
            <button className="button soft" onClick={save}><PenLine size={15} /> Save collection</button>
          </div>
        ) : (
          <>
            <p className="collection-description">{collection.description || "No description yet."}</p>
            <div className="collection-items">
              {collection.items.length ? collection.items.map((item) => (
                <button type="button" className="collection-detail-item" key={item.igdbId} onDoubleClick={() => { seedGame({ id: item.igdbId, name: item.name, cover: item.cover }); openDiscover(item.igdbId); }}>
                  <img src={hq(item.cover)} alt="" loading="lazy" decoding="async" draggable={false} />
                  <span>{item.name}</span>
                </button>
              )) : <p className="muted">This collection is empty.</p>}
            </div>
            <button className="button soft collection-edit-button" onClick={() => setEditing(true)}><PenLine size={15} /> Edit collection</button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// Renders a hero-tab button (+ its popup). Put it directly inside <div className="hero-tab">, no wrapper element.
export function CollectionActions({ data, update, game, igdbId, cover }: { data: AppData; update: (data: AppData) => void; game: Game; igdbId?: number; cover?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const collections = data.collections ?? [];
  const item = igdbId ? { igdbId, name: game.title, cover } : undefined;
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || !item) return;
    update({ ...data, collections: [...collections, { id: crypto.randomUUID(), name: trimmed, description: description.trim(), items: [item] }] });
    setName(""); setDescription(""); setOpen(false);
  };
  const add = (id: string) => {
    if (!item) return;
    update({ ...data, collections: collections.map((c) => c.id === id && !c.items.some((i) => i.igdbId === item.igdbId) ? { ...c, items: [...c.items, item] } : c) });
    setOpen(false);
  };
  return (
    <>
      <button type="button" title={igdbId ? "Add to collection" : "Link this game to IGDB (Edit → pick from IGDB) to use collections"} disabled={!igdbId} onClick={() => setOpen(true)}>
        <FolderPlus size={16} /><span>Collection</span>
      </button>
      {open && createPortal(
        <div className="modal-backdrop collection-backdrop" onClick={() => setOpen(false)}>
          <div className="modal collection-modal collection-picker glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div><p className="eyebrow">PERSONAL CURATION</p><h2>Add to collection</h2></div>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close collection picker"><X size={18} /></button>
            </div>
            <div className="collection-current-game">
              {cover ? <img src={hq(cover)} alt="" /> : <div className="collection-cover-placeholder" />}
              <strong>{game.title}</strong>
            </div>
            <div className="collection-picker-list">
              {collections.length === 0 && <p className="muted">No collections yet. Create your first one below.</p>}
              {collections.map((c) => {
                const has = c.items.some((i) => i.igdbId === igdbId);
                return (
                  <button type="button" key={c.id} disabled={has} onClick={() => add(c.id)}>
                    <div className="collection-picker-cover">{c.items[0]?.cover && <img src={hq(c.items[0].cover)} alt="" />}</div>
                    <span><strong>{c.name}</strong><small>{c.items.length} games{c.description ? ` · ${c.description}` : ""}</small></span>
                    {has ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                );
              })}
            </div>
            <div className="collection-create-form">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New collection name" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 180))} maxLength={180} placeholder="Description (180 characters max)" />
              <button className="button soft" onClick={create}><Plus size={15} /> Create collection</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
