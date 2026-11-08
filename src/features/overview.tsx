import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, FolderPlus, ImagePlus, PenLine, Plus, Trash2, X } from "lucide-react";
import type { AppData, Collection, CollectionItem, Game } from "../domain/game";
import { seedGame } from "./discover";
import "./overview.css";
import { RarityBadge } from "../components/rarity-badge"; // adjust path if layout.tsx lives elsewhere

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
        <i className="profile-aurora" aria-hidden="true" />
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
            : <h2 className="profile-name">{data.profile.displayName}</h2>}
          {editing
            ? <textarea value={bio} onChange={(e) => setBio(e.target.value)} />
            : <p>{data.profile.bio}</p>}
          <RarityBadge games={data.games} />
          {pictureError && <span className="date-error">{pictureError}</span>}
        </div>
        <div className="profile-count"><strong>{data.games.length}</strong><span>games collected</span></div>
      </section>
    </>
  );
}

/* ───────────── collections ───────────── */

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

type GameMap = Map<string, Game>;
// custom games: the cover is read from the library, so large image data is never duplicated here
const coverOf = (item: CollectionItem, games: GameMap) => hq(games.get(item.gameId ?? "")?.cover ?? item.cover);
const collectionArt = (c: Collection, games: GameMap) => c.image ?? (c.items[0] ? coverOf(c.items[0], games) : undefined);
const sameItem = (i: CollectionItem, game: Game) => i.gameId === game.id || (game.igdbId != null && i.igdbId === game.igdbId);

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
  const gameMap = useMemo(() => new Map(data.games.map((g) => [g.id, g])), [data.games]);
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
          {collections.map((c) => {
            const art = collectionArt(c, gameMap);
            return (
              <button type="button" className="collection-card" key={c.id} onClick={() => setSelectedId(c.id)}>
                <div className={`collection-poster${art ? "" : " empty"}`}>
                  {art
                    ? <img src={art} alt="" loading="lazy" decoding="async" draggable={false} />
                    : <Plus size={26} />}
                  <div className="collection-poster-info">
                    <strong>{c.name}</strong>
                    <small>{c.items.length} games</small>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {current && (
        <CollectionDetail
          collection={current}
          data={data}
          update={update}
          openDiscover={openDiscover}
          openGame={openGame}
          close={() => setSelectedId(undefined)}
        />
      )}
    </section>
  );
}

function CollectionDetail({
  collection, data, update, openDiscover, openGame, close,
}: {
  collection: Collection;
  data: AppData;
  update: (data: AppData) => void;
  openDiscover: (id: number) => void;
  openGame: (id: string) => void;
  close: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [image, setImage] = useState<string | undefined>(collection.image);
  const gameMap = useMemo(() => new Map(data.games.map((g) => [g.id, g])), [data.games]);
  async function remove() {
    update({ ...data, collections: (data.collections ?? []).filter((c) => c.id !== collection.id) });
    close();
  };


  const save = () => {
    update({
      ...data,
      collections: (data.collections ?? []).map((item) =>
        item.id === collection.id
          ? { ...item, name: name.trim() || item.name, description: description.trim(), image }
          : item
      ),
    });
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
            <CollectionImagePicker
              value={image}
              fallback={collection.items[0] ? coverOf(collection.items[0], gameMap) : undefined}
              onChange={setImage}
            />
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
            <label>Description
              <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 180))} maxLength={180} placeholder="Describe this collection (180 characters max)" />
              <small>{description.length}/180</small>
            </label>
            <div className="collection-actions-row">
              <button className="button soft" onClick={save}><PenLine size={15} /> Save collection</button>
              <button className="button stop" onClick={remove}><Trash2 size={15} /> Delete</button>
            </div>
          </div>
        ) : (
          <>
            <p className="collection-description">{collection.description || "No description yet."}</p>
            <div className="collection-items">
              {collection.items.length ? collection.items.map((item) => (
                <button
                  type="button"
                  className="collection-detail-item"
                  key={item.gameId ?? item.igdbId}
                  title={item.igdbId ? "Double-click to open" : "Double-click to open in your library"}
                  onDoubleClick={() => {
                    if (item.igdbId) {
                      seedGame({ id: item.igdbId, name: item.name, cover: item.cover });
                      openDiscover(item.igdbId);
                    } else if (item.gameId && gameMap.has(item.gameId)) {
                      openGame(item.gameId);
                    }
                  }}
                >
                  <img src={coverOf(item, gameMap)} alt="" loading="lazy" decoding="async" draggable={false} />
                  <span>{item.name}</span>
                </button>
              )) : <p className="muted">This collection is empty.</p>}
            </div>
            <div className="collection-actions-row">
              <button className="button soft" onClick={() => setEditing(true)}><PenLine size={15} /> Edit collection</button>
              <button className="button stop" onClick={remove}><Trash2 size={15} /> Delete collection</button>
            </div>
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
  const [image, setImage] = useState<string | undefined>();
  const collections = data.collections ?? [];
  const gameMap = useMemo(() => new Map(data.games.map((g) => [g.id, g])), [data.games]);
  // data: URLs (custom covers) are not copied; they are read from the library when shown
  const item: CollectionItem = {
    gameId: game.id,
    igdbId,
    name: game.title,
    cover: cover?.startsWith("data:") ? undefined : cover,
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    update({
      ...data,
      collections: [...collections, { id: crypto.randomUUID(), name: trimmed, description: description.trim(), image, items: [item] }],
    });
    setName(""); setDescription(""); setImage(undefined); setOpen(false);
  };

  const add = (id: string) => {
    update({
      ...data,
      collections: collections.map((c) =>
        c.id === id && !c.items.some((i) => sameItem(i, game)) ? { ...c, items: [...c.items, item] } : c
      ),
    });
    setOpen(false);
  };

  return (
    <>
      <button type="button" title="Add to collection" onClick={() => setOpen(true)}>
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
                const has = c.items.some((i) => sameItem(i, game));
                const art = collectionArt(c, gameMap);
                return (
                  <button type="button" key={c.id} disabled={has} onClick={() => add(c.id)}>
                    <div className="collection-picker-cover">{art && <img src={art} alt="" />}</div>
                    <span><strong>{c.name}</strong><small>{c.items.length} games{c.description ? ` · ${c.description}` : ""}</small></span>
                    {has ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                );
              })}
            </div>
            <div className="collection-create-form">
              <CollectionImagePicker value={image} fallback={hq(cover)} onChange={setImage} />
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