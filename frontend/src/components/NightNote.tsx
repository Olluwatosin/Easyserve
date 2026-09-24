"use client";

/**
 * One line about why tonight was what it was.
 *
 * Sales alone say some Fridays are enormous and some Tuesdays are dead, with no
 * idea why — a live act, a public holiday, a downpour and a four-hour power cut
 * all arrive as the same unexplained noise. A forecast built on that learns very
 * little, and it learns it slowly. One line turns each of those from an outlier
 * into a reason.
 *
 * Written by whoever closes, because that is the only moment anybody remembers.
 * Which means it has to be quick: a row of tags does the work a report can
 * group on, and the sentence is optional for the nights where the tag is not
 * the whole story.
 *
 * Saved explicitly rather than on every keystroke. This is a text box somebody
 * is mid-sentence in at 4AM, and an autosave that fires between clauses stores
 * half a thought and makes the field feel like it is fighting back.
 */

import { useEffect, useState } from "react";
import { Check, NotebookPen } from "lucide-react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";

interface Night {
  business_date: string;
  note: string | null;
  tag: string | null;
  recorded_by_name: string | null;
}

/** Words for the tags the API defines. The list itself comes from the server so
 *  there is only one of it; these are just how each one reads. */
const TAG_WORDS: Record<string, string> = {
  live_music: "Live music",
  dj: "DJ",
  holiday: "Public holiday",
  match_day: "Match day",
  private_event: "Private event",
  power_cut: "Power cut",
  rain: "Heavy rain",
  quiet: "Just quiet",
  other: "Something else",
};

export function NightNote() {
  const [tags, setTags] = useState<string[]>([]);
  const [tag, setTag] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<Night | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .get<{ tags: string[] }>("/nights/tags")
      .then((r) => setTags(r.data.tags))
      .catch(() => setTags(Object.keys(TAG_WORDS)));

    api
      .get<Night | null>("/nights/tonight")
      .then((r) => {
        if (r.data) {
          setSaved(r.data);
          setTag(r.data.tag);
          setNote(r.data.note ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // A night with nothing written is the normal state for most of a night, so
  // the card invites rather than warns.
  const dirty =
    loaded && ((saved?.tag ?? null) !== tag || (saved?.note ?? "") !== note.trim());

  async function save() {
    setBusy(true);
    try {
      // No date is sent: the server decides which night this is. The browser's
      // idea of "today" is wrong for the hours either side of the 6AM rollover,
      // which is exactly when somebody closing up writes this.
      const { data } = await api.put<Night>("/nights/tonight", {
        tag,
        note: note.trim() || null,
      });
      setSaved(data.tag || data.note ? data : null);
      toast.success(
        tag || note.trim() ? "Tonight noted" : "Note cleared",
      );
    } catch {
      toast.error("Could not save the note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-start gap-3 mb-4">
        <NotebookPen size={16} style={{ color: "var(--teal)", flexShrink: 0, marginTop: 3 }} />
        <div className="flex-1">
          <p className="font-semibold" style={{ color: "var(--text)" }}>
            What kind of night was it?
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Takings on their own cannot tell a live act from a power cut. One line
            here is what makes a quiet Tuesday explainable later.
          </p>
        </div>
        {saved && !dirty && (
          <span className="badge-teal">
            <Check size={11} />
            Noted
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((t) => {
          const on = tag === t;
          return (
            <button
              key={t}
              // Tapping the chosen tag again clears it, which is how somebody
              // fixes a mis-tap without hunting for an "unset" control.
              onClick={() => setTag(on ? null : t)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                color: on ? "var(--teal)" : "var(--muted)",
                background: on ? "rgba(0,212,180,0.08)" : "transparent",
                border: `1px solid ${on ? "rgba(0,212,180,0.25)" : "var(--border)"}`,
              }}
            >
              {TAG_WORDS[t] ?? t}
            </button>
          );
        })}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Anything worth remembering — who played, what broke, why it was busy."
        className="input"
        style={{ resize: "vertical", minHeight: 64 }}
      />

      <div className="flex items-center gap-4 mt-3">
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="btn-teal"
          style={{ opacity: busy || !dirty ? 0.45 : 1, padding: "10px 20px" }}
        >
          {busy ? "Saving…" : saved ? "Update note" : "Save note"}
        </button>
        {saved?.recorded_by_name && !dirty && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Written by {saved.recorded_by_name}
          </p>
        )}
      </div>
    </div>
  );
}
