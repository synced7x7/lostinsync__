import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, PenLine, Plus, Sparkles, X } from "lucide-react";
import type { AppData, Collection, Game } from "../domain/game";
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

export function CollectionShowcase({ data, update, openGame, openDiscover }: { data: AppData; update: (data: AppData) => void; openGame: (id: string) => void; openDiscover: (id: number) => void }) {
  const [selected, setSelected] = useState<Collection>();
  const collections = data.collections ?? [];
  return <section className="collections-panel glass"><div className="collections-heading"><div><p className="eyebrow">PERSONAL CURATION</p><h2>Collections</h2><p className="muted">Your curated game lists.</p></div></div>{collections.length === 0 ? <p className="muted">Create collections from any game detail page.</p> : <div className="collection-showcase-row">{collections.map((collection) => <button className="collection-showcase-card" key={collection.id} onClick={() => setSelected(collection)}><div className="collection-cover">{collection.items[0]?.cover ? <img src={collection.items[0].cover} alt="" /> : <Plus size={24} />}</div><strong>{collection.name}</strong><small>{collection.items.length} games</small></button>)}</div>}{selected && <CollectionDetail collection={selected} data={data} update={update} openDiscover={openDiscover} close={() => setSelected(undefined)} />}</section>;
}

function CollectionDetail({ collection, data, update, openDiscover, close }: { collection: Collection; data: AppData; update: (data: AppData) => void; openDiscover: (id: number) => void; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const save = () => {
    update({ ...data, collections: (data.collections ?? []).map((item) => item.id === collection.id ? { ...item, name: name.trim() || item.name, description: description.trim() } : item) });
    setEditing(false);
  };
  return createPortal(<div className="modal-backdrop" onClick={close}><div className="modal modal-wide collection-modal glass" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">PERSONAL CURATION</p><h2>{editing ? "Edit collection" : collection.name}</h2></div><button className="icon-btn" onClick={close} aria-label="Close collection"><X size={18} /></button></div>{editing ? <div className="collection-edit-form"><label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 180))} maxLength={180} placeholder="Describe this collection (180 characters max)" /><small>{description.length}/180</small></label><button className="button soft" onClick={save}><PenLine size={15} /> Save collection</button></div> : <><p className="collection-description">{collection.description || "No description yet."}</p><div className="collection-items">{collection.items.length ? collection.items.map((item) => <button className="collection-detail-item" key={item.igdbId} onDoubleClick={() => openDiscover(item.igdbId)} title="Double-click to open details"><img src={item.cover} alt="" /><span>{item.name}</span></button>) : <p className="muted">This collection is empty.</p>}</div><button className="button soft collection-edit-button" onClick={() => setEditing(true)}><PenLine size={15} /> Edit collection</button></>}</div></div>, document.body);
}

export function CollectionActions({ data, update, game, igdbId, cover }: { data: AppData; update: (data: AppData) => void; game: Game; igdbId: number; cover?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const collections = data.collections ?? [];
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const collection: Collection = { id: crypto.randomUUID(), name: trimmed, description: description.trim(), items: [{ igdbId, name: game.title, cover }] };
    update({ ...data, collections: [...collections, collection] });
    setName("");
    setDescription("");
  };
  const add = (id: string) => update({ ...data, collections: collections.map((collection) => collection.id === id && !collection.items.some((item) => item.igdbId === igdbId) ? { ...collection, items: [...collection.items, { igdbId, name: game.title, cover }] } : collection) });
  return <>{<button onClick={() => setOpen(true)}><Plus size={16} /> </button>}{open && createPortal(<div className="modal-backdrop" onClick={() => setOpen(false)}><div className="modal collection-modal glass" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">PERSONAL CURATION</p><h2>Add game to collection</h2></div><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close collection picker"><X size={18} /></button></div><div className="collection-current-game">{cover ? <img src={cover} alt="" /> : <div className="collection-cover-placeholder" />}<strong>{game.title}</strong></div><div className="collection-picker-list">{collections.map((collection) => <button key={collection.id} onClick={() => { add(collection.id); setOpen(false); }}><div className="collection-picker-cover">{collection.items[0]?.cover && <img src={collection.items[0].cover} alt="" />}</div><span><strong>{collection.name}</strong><small>{collection.items.length} games{collection.description ? ` · ${collection.description}` : ""}</small></span><Plus size={16} /></button>)}</div><div className="collection-create-form"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="New collection name" /><textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 180))} maxLength={180} placeholder="Description (180 characters max)" /><button className="button soft" onClick={create}><Plus size={15} /> Create collection</button></div></div></div>, document.body)}</>;
}
