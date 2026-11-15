import styles from './EncounterDocumentationNotice.module.css';

export function EncounterDocumentationNotice() {
  return (
    <section className="encounter-transcript" aria-labelledby="encounter-documentation-title">
      <header>
        <h2 id="encounter-documentation-title">AI notes are in beta</h2>
      </header>
      <p className="transcript-source">
        Transcripts and drafts can miss or change details. Take your own notes during the visit. Before using any
        draft, verify medication names, doses, timing and negation against the source and your notes.
      </p>
      <div className={styles.manualNotes}>
        <label htmlFor="encounter-manual-note">Manual demo notes</label>
        <small id="encounter-manual-note-help">Use fictional details. This field clears when you leave the encounter.</small>
        <textarea id="encounter-manual-note" aria-describedby="encounter-manual-note-help" rows={4} spellCheck={false} />
      </div>
    </section>
  );
}
