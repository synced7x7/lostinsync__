import { useEffect, useRef, useState } from "react";
import { Camera, Check, PenLine, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { igdbSearch, type IgdbHit } from "../data/igdb";
import type { AppData, Collection } from "../domain/game";
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
    <Collections data={data} update={update} />
    </>
  );
}

function Collections({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbHit[]>([]);
  const [error, setError] = useState("");
  const collections = data.collections ?? [];
  const active = collections.find((collection) => collection.id === activeId) ?? collections[0];
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const collection: Collection = { id: crypto.randomUUID(), name: trimmed, items: [] };
    update({ ...data, collections: [...collections, collection] });
    setName("");
    setActiveId(collection.id);
  };
  const search = async () => {
    if (!query.trim() || !data.settings.igdbClientId || !data.settings.igdbClientSecret) return;
    try { setError(""); setResults(await igdbSearch(query, { clientId: data.settings.igdbClientId, clientSecret: data.settings.igdbClientSecret })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not search IGDB."); }
  };
  const add = (game: IgdbHit) => {
    if (!active || active.items.some((item) => item.igdbId === game.id)) return;
    update({ ...data, collections: collections.map((collection) => collection.id === active.id ? { ...collection, items: [...collection.items, { igdbId: game.id, name: game.name, cover: game.cover }] } : collection) });
  };
  const remove = (id: number) => active && update({ ...data, collections: collections.map((collection) => collection.id === active.id ? { ...collection, items: collection.items.filter((item) => item.igdbId !== id) } : collection) });
  return <section className="collections-panel glass"><div className="collections-heading"><div><p className="eyebrow">PERSONAL CURATION</p><h2>Collections</h2><p className="muted">Build lists from the full IGDB catalog, even when a game is not in your library.</p></div><div className="collection-create"><input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder="New collection" /><button className="button soft" onClick={create}><Plus size={15} /> Create</button></div></div>{collections.length > 0 && <div className="collection-tabs">{collections.map((collection) => <button key={collection.id} className={collection.id === active?.id ? "active" : ""} onClick={() => setActiveId(collection.id)}>{collection.name}<span>{collection.items.length}</span></button>)}</div>}{active && <><div className="collection-search"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder='Search IGDB to add a game...' /><button className="button soft" onClick={() => void search()}><Search size={15} /> Search</button></div>{error && <p className="date-error">{error}</p>}{results.length > 0 && <div className="collection-results">{results.map((game) => <button key={game.id} onClick={() => add(game)}><img src={game.cover} alt="" /><span><strong>{game.name}</strong><small>{game.developer ?? "Unknown developer"}</small></span><Check size={15} /></button>)}</div>}<div className="collection-items">{active.items.map((item) => <div key={item.igdbId}><img src={item.cover} alt="" /><span>{item.name}</span><button onClick={() => remove(item.igdbId)} aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button></div>)}</div></>}</section>;
}
