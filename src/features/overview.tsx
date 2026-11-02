import { useEffect, useRef, useState } from "react";
import { Camera, PenLine, Sparkles } from "lucide-react";
import type { AppData } from "../domain/game";
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
  );
}
