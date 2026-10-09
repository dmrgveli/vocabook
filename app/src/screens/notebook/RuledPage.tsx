import { Link } from "react-router-dom";
import {
  KBadge,
  MasteryMeter,
  SpeakButton,
  toneClass,
} from "../../components/ui";
import type { useWordPreview } from "../../components/WordPreview";
import { cleanDefinition } from "../../data/flashback";
import { metEncounters, type Entry } from "../../data/model";
import {
  entrySource,
  lineSentence,
  topPhrases,
  type Group,
} from "../../data/notebook";
import { wordPath } from "../../data/paths";

// The notebook as a ruled page: one continuous sheet, a red margin with the day (or source,
// level…) of each group, and one ruled entry per word. "full" writes out everything the
// word has: meaning, phrases, a sentence. "brief" is one line per word; resting the pointer
// on it opens the details (desktop).

export type Detail = "full" | "brief";

interface Props {
  groups: Group[];
  detail: Detail;
  /** what the margin says for a group, or nothing when the notebook isn't grouped */
  margin?: (key: string) => { title: string; sub?: string };
  /** labels: day, source…; letters: an index letter (A–Z without groups); plain: a narrow empty margin */
  marginStyle?: "labels" | "letters" | "plain";
  preview: ReturnType<typeof useWordPreview>;
}

export function RuledPage({
  groups,
  detail,
  margin,
  marginStyle = margin ? "labels" : "plain",
  preview,
}: Props) {
  return (
    <div
      className={`sheet sheet-${detail}`}
      data-margin={marginStyle}
    >
      {groups.map(({ key, entries }) => {
        const label = margin?.(key);
        return (
          <section key={key} className="sheet-group">
            <h2 className="sheet-margin">
              {label && (
                <>
                  <span className="sheet-margin-title">{label.title}</span>
                  {label.sub && (
                    <span className="sheet-margin-sub">{label.sub}</span>
                  )}
                  {marginStyle === "labels" && (
                  <span className="sheet-margin-count">
                    {entries.length} {entries.length === 1 ? "word" : "words"}
                  </span>
                  )}
                </>
              )}
            </h2>
            <ol className="sheet-lines">
              {entries.map((e) => (
                <li
                  key={e.id}
                  {...(detail === "brief" ? preview.handlers(e) : {})}
                >
                  {detail === "full" ? (
                    <FullLine entry={e} />
                  ) : (
                    <BriefLine entry={e} />
                  )}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

const firstMeaning = (entry: Entry) => entry.enrichment?.meanings[0];
/** The first definition without its usage labels: "(intransitive) To grow…" → "To grow…" */
const firstDefinition = (entry: Entry) => {
  const d = firstMeaning(entry)?.definitions[0]?.definition;
  return d && cleanDefinition(d);
};

function Source({ entry }: { entry: Entry }) {
  const source = entrySource(entry);
  const encounters = metEncounters(entry).length;
  if (!source) return <span className="line-source" />;
  return (
    <span
      className="line-source"
      title={encounters > 1 ? `${source} · met ${encounters} times` : source}
    >
      <span className="truncate">{source}</span>
      {encounters > 1 && <span className="encounter-count">×{encounters}</span>}
    </span>
  );
}

/** Everything about the word on two or three ruled lines. */
function FullLine({ entry }: { entry: Entry }) {
  const meaning = firstMeaning(entry);
  const definition = firstDefinition(entry);
  const phrases = topPhrases(entry);
  const sentence = lineSentence(entry);
  return (
    <article className={`line line-full ${toneClass(entry.word)}`}>
      <div className="line-word">
        <div className="line-head">
          {/* the link stretches over the whole entry; buttons and the badge sit above it */}
          <Link
            to={wordPath(entry.word)}
            className="word-font line-word-link card-link"
            lang="en"
          >
            {entry.word}
          </Link>
          <KBadge word={entry.word} />
        </div>
        <div className="line-sub">
          <SpeakButton text={entry.word} />
          {entry.enrichment?.phonetic && (
            <span className="phonetic">{entry.enrichment.phonetic}</span>
          )}
          {meaning && <span className="line-pos">{meaning.partOfSpeech}</span>}
        </div>
        <div className="line-meta">
          <Source entry={entry} />
          <MasteryMeter level={entry.mastery} />
        </div>
      </div>
      <div className="line-notes">
        {(entry.translation || definition) && (
          <p className="line-meaning clamp">
            {entry.translation && (
              <strong className="line-translation">{entry.translation}</strong>
            )}
            {entry.translation && definition && (
              <span className="faint"> · </span>
            )}
            {definition && (
              <span className="line-definition">{definition}</span>
            )}
          </p>
        )}
        {phrases.length > 0 && (
          <p className="line-phrases" lang="en">
            {phrases.map((p) => (
              <span key={p} className="line-phrase word-font">
                {p}
              </span>
            ))}
          </p>
        )}
        {sentence && (
          <p
            className={`line-sentence word-font clamp${sentence.mine ? " line-sentence-mine" : ""}`}
            lang="en"
            title={sentence.mine ? undefined : "Example"}
          >
            “{sentence.text}”
          </p>
        )}
        {!entry.enrichment && !entry.translation && (
          <p className="faint small">
            The dictionary details are on their way…
          </p>
        )}
      </div>
    </article>
  );
}

/** One line per word: the details open when the pointer rests on it. */
function BriefLine({ entry }: { entry: Entry }) {
  const definition = firstDefinition(entry);
  return (
    <article className={`line line-brief ${toneClass(entry.word)}`}>
      <Link
        to={wordPath(entry.word)}
        className="word-font line-word-link card-link truncate"
        lang="en"
        data-preview-anchor
      >
        {entry.word}
      </Link>
      <SpeakButton text={entry.word} />
      <span className="phonetic line-ipa truncate">
        {entry.enrichment?.phonetic}
      </span>
      <span className="line-brief-meaning truncate">
        {entry.translation ? (
          <strong className="line-translation">{entry.translation}</strong>
        ) : (
          definition
        )}
      </span>
      <Source entry={entry} />
      <MasteryMeter level={entry.mastery} />
      <span className="line-k">
        <KBadge word={entry.word} plain />
      </span>
    </article>
  );
}
