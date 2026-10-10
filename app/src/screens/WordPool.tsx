import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  Search,
  ZoomIn,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { peek, type Peek } from "../api/datamuse";
import { fetchPool, type PoolData } from "../api/pool";
import { useAppState } from "../app/state";
import { useIsMobile } from "../components/MobileBar";
import { KBadge, SpeakButton } from "../components/ui";
import { useEntries, useSuggestions } from "../hooks";
import { normalizeWord } from "../data/model";
import { lookPath, ringsPath, wordPath } from "../data/paths";
import { RING_NAMES, type PoolItem } from "../data/pool";
import { DESKTOP, PHONE, PoolEngine, RING_VARS } from "./pool/engine";

// Word rings: search a word, then travel through the words around it on three rings
// (same meaning · explains it · used with it). Desktop: turn, tilt, hover for details,
// click to go to a word. Phones: zoom between the rings, tap a word for details.

const ZOOM_TIP_KEY = "pool-zoom-tip";

export function WordPool() {
  const { param } = useParams();
  const navigate = useNavigate();
  const word = param ? normalizeWord(param.replace(/\+/g, " ")) : undefined;
  return (
    <div className="page pool-page">
      <header className="page-header pool-header">
        <h1 className="page-title">
          Word <span className="marked">rings</span>
        </h1>
        <PoolSearch
          key={word}
          initial={word ?? ""}
          onPick={(w) => navigate(ringsPath(w))}
        />
      </header>
      {word ? <PoolView word={word} /> : <PoolStart />}
    </div>
  );
}

function PoolSearch({
  initial,
  onPick,
}: {
  initial: string;
  onPick: (word: string) => void;
}) {
  const [input, setInput] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const suggestions = useSuggestions(input, open);
  const items = suggestions.items.slice(0, 6);
  const pick = (w: string) => {
    const word = normalizeWord(w);
    if (!word) return;
    setOpen(false);
    setInput(word);
    onPick(word);
  };
  return (
    <div className="pool-search" data-pool-ui>
      <label className="search">
        <Search size={17} className="faint" />
        <input
          type="search"
          value={input}
          placeholder="Search any word…"
          aria-label="Search a word for its rings"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls="pool-suggestions"
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown")
              setActive((a) => Math.min(a + 1, items.length - 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
            else if (e.key === "Enter") pick(items[active]?.word ?? input);
            else if (e.key === "Escape") setOpen(false);
            else return;
            e.preventDefault();
          }}
        />
      </label>
      {open && items.length > 0 && (
        <ul className="pool-suggestions" id="pool-suggestions" role="listbox">
          {items.map((s, i) => (
            <li key={s.word} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.word)}
              >
                <span className="word-font">{s.word}</span>
                <KBadge word={s.word} plain />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Before a word is chosen: what the pool is, and a few of your own words to start from. */
function PoolStart() {
  const entries = useEntries();
  const recent = useMemo(
    () =>
      [...(entries ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [entries],
  );
  return (
    <motion.section
      className="pool-start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="pool-start-rings" aria-hidden>
        <span style={{ "--ring": RING_VARS[2] } as React.CSSProperties} />
        <span style={{ "--ring": RING_VARS[1] } as React.CSSProperties} />
        <span style={{ "--ring": RING_VARS[0] } as React.CSSProperties} />
      </div>
      <p className="pool-start-text">
        Pick a word and travel through the words around it: the ones that{" "}
        <b>mean the same</b>, the ones that <b>explain it</b> and the ones it is{" "}
        <b>used with</b>. Every word you choose opens its own rings.
      </p>
      {recent.length > 0 && (
        <div className="pool-start-words">
          <span className="label-sm">Start from one of your words</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {recent.map((e) => (
              <Link key={e.id} to={ringsPath(e.word)} className="chip word-font">
                {e.word}
              </Link>
            ))}
          </div>
        </div>
      )}
    </motion.section>
  );
}

type PoolState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; data: PoolData };

function usePool(word: string): [PoolState, () => void] {
  const [state, setState] = useState<PoolState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetchPool(word).then(
      (data) => active && setState({ status: "ready", data }),
      () => active && setState({ status: "failed" }),
    );
    return () => {
      active = false;
    };
  }, [word, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

function PoolView({ word }: { word: string }) {
  const mobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const cameFrom = (location.state as { from?: string } | null)?.from;
  const [state, retry] = usePool(word);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const center = useRef<HTMLDivElement>(null);
  const engine = useRef<PoolEngine>(undefined);
  const pills = useRef(new Map<string, HTMLButtonElement>());
  const fromPoint = useRef<[number, number]>(undefined);
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState<{
    item: PoolItem;
    x: number;
    top: number;
    bottom: number;
  }>();
  const [selected, setSelected] = useState<PoolItem>();
  const [zoomTip, setZoomTip] = useState(() => {
    try {
      return localStorage.getItem(ZOOM_TIP_KEY) !== "done";
    } catch {
      return true;
    }
  });
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // one engine per layout (desktop or phone)
  useEffect(() => {
    if (!stage.current || !svg.current || !canvas.current || !center.current)
      return;
    const e = new PoolEngine(
      stage.current,
      svg.current,
      canvas.current,
      center.current,
      mobile ? PHONE : DESKTOP,
      setLevel,
    );
    engine.current = e;
    return () => e.destroy();
  }, [mobile]);

  // a new word: the rings grow out of where it was
  useLayoutEffect(() => {
    engine.current?.open(fromPoint.current);
    fromPoint.current = undefined;
    setHover(undefined);
    setSelected(undefined);
  }, [word]);

  const rings = state.status === "ready" ? state.data.rings : undefined;
  useLayoutEffect(() => {
    const seats = (rings ?? []).flatMap((ring) =>
      ring.map((item, slot) => ({
        el: pills.current.get(item.word + item.ring)!,
        ring: item.ring,
        slot,
      })),
    );
    engine.current?.setSeats(seats.filter((s) => s.el));
  }, [rings, mobile]);

  useEffect(() => {
    if (level > 0 && zoomTip) {
      setZoomTip(false);
      try {
        localStorage.setItem(ZOOM_TIP_KEY, "done");
      } catch {
        // the tip shows again next time
      }
    }
  }, [level, zoomTip]);

  const go = (item: PoolItem, el?: HTMLElement | null) => {
    const box = stage.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (box && r)
      fromPoint.current = [r.left + r.width / 2 - box.left, r.bottom - box.top];
    navigate(ringsPath(item.word), { state: { from: word } });
  };

  const showCard = (item: PoolItem, el: HTMLElement) => {
    if (mobile) return;
    clearTimeout(hideTimer.current);
    const box = stage.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setHover({
      item,
      x: r.left + r.width / 2 - box.left,
      top: r.top - box.top,
      bottom: r.bottom - box.top,
    });
  };
  const hideCard = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHover(undefined), 220);
  };
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const empty = rings !== undefined && rings.every((r) => r.length === 0);

  return (
    <section className={`pool ${mobile ? "pool-phone" : "pool-desk"}`}>
      {mobile && (
        <div className="pool-levels" aria-live="polite">
          {[2, 1, 0].map((ri) => (
            <span
              key={ri}
              className={2 - level === ri ? "on" : ""}
              style={{ "--ring": RING_VARS[ri] } as React.CSSProperties}
            >
              <i /> {RING_NAMES[ri]}
            </span>
          ))}
        </div>
      )}

      <div
        ref={stage}
        className="pool-stage"
        tabIndex={0}
        aria-label={
          mobile
            ? `Words around “${word}”. Pinch or use the + and − buttons to move between the rings, swipe sideways to turn them.`
            : `Words around “${word}”. Drag sideways or use the arrow keys to turn the rings, drag up and down to tilt them.`
        }
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "ArrowLeft") engine.current?.turn(-1);
          else if (e.key === "ArrowRight") engine.current?.turn(1);
          else if (e.key === "+" || e.key === "=") engine.current?.zoomBy(1);
          else if (e.key === "-") engine.current?.zoomBy(-1);
          else return;
          e.preventDefault();
        }}
      >
        <canvas ref={canvas} className="pool-dots" aria-hidden />
        <svg ref={svg} className="pool-lines" aria-hidden />
        <div ref={center} className="pool-center word-font" lang="en">
          {word}
        </div>
        {rings?.map((ring) =>
          ring.map((item) => (
            <button
              key={item.word + item.ring}
              ref={(el) => {
                if (el) pills.current.set(item.word + item.ring, el);
                else pills.current.delete(item.word + item.ring);
              }}
              type="button"
              className="pool-pill word-font"
              aria-pressed={
                selected?.word === item.word && selected.ring === item.ring
              }
              style={
                {
                  "--ring": RING_VARS[item.ring],
                  opacity: 0,
                } as React.CSSProperties
              }
              lang="en"
              aria-label={`${item.word}: ${RING_NAMES[item.ring]}`}
              onMouseEnter={(e) => showCard(item, e.currentTarget)}
              onMouseLeave={hideCard}
              onFocus={(e) => showCard(item, e.currentTarget)}
              onBlur={hideCard}
              onClick={(e) => {
                if (engine.current?.wasDrag()) return;
                if (mobile) setSelected(item);
                else go(item, e.currentTarget);
              }}
            >
              {item.word}
            </button>
          )),
        )}

        {!mobile && (
          <>
            <div className="pool-legend" data-pool-ui>
              {RING_NAMES.map((name, ri) => (
                <span
                  key={name}
                  style={{ "--ring": RING_VARS[ri] } as React.CSSProperties}
                >
                  <i /> {name}
                </span>
              ))}
            </div>
          </>
        )}
        {mobile && (
          <div className="pool-zoom" data-pool-ui>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom in"
              onClick={() => engine.current?.zoomBy(1)}
            >
              <Plus size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Zoom out"
              onClick={() => engine.current?.zoomBy(-1)}
            >
              <Minus size={17} />
            </button>
          </div>
        )}
        <AnimatePresence>
          {mobile && zoomTip && level === 0 && rings && !empty && (
            <motion.div
              className="pool-zoom-tip"
              data-pool-ui
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ZoomIn size={16} /> Pinch or tap + : closer words are inside
            </motion.div>
          )}
        </AnimatePresence>
        {state.status === "loading" && (
          <p className="pool-status">Finding the words around “{word}”…</p>
        )}
        {state.status === "failed" && (
          <p className="pool-status" data-pool-ui>
            Couldn't find words around “{word}” right now.{" "}
            <button
              type="button"
              className="btn btn-quiet small"
              onClick={retry}
            >
              Try again
            </button>
          </p>
        )}
        {empty && (
          <p className="pool-status">
            Not enough closely related words for “{word}”.
          </p>
        )}

        {!mobile && hover && (
          <HoverCard
            hover={hover}
            center={word}
            stage={stage}
            onKeep={() => clearTimeout(hideTimer.current)}
            onLeave={hideCard}
            onOpen={() =>
              go(
                hover.item,
                pills.current.get(hover.item.word + hover.item.ring),
              )
            }
          />
        )}
      </div>

      {!mobile && (
        <aside className="pool-aside">
          <div className="pool-plate">
            <WordCard word={word} back={cameFrom} onBack={() => navigate(-1)} />
          </div>
          <ul className="pool-tips">
            <li>
              Hover a word to see what it means; click it to open its own rings.
            </li>
            <li>
              Drag sideways (or use ← →) to turn the rings, up and down to tilt
              them.
            </li>
          </ul>
        </aside>
      )}

      {mobile && (
        <div className="pool-sheet">
          {selected ? (
            <WordCard
              key={selected.word + selected.ring}
              word={selected.word}
              item={selected}
              center={word}
              onOpen={() =>
                go(selected, pills.current.get(selected.word + selected.ring))
              }
            />
          ) : (
            <WordCard
              word={word}
              back={cameFrom}
              onBack={() => navigate(-1)}
              hint="Tap a word on the rings to see it here"
            />
          )}
        </div>
      )}
    </section>
  );
}

function HoverCard({
  hover,
  center,
  stage,
  onKeep,
  onLeave,
  onOpen,
}: {
  hover: { item: PoolItem; x: number; top: number; bottom: number };
  center: string;
  stage: React.RefObject<HTMLDivElement | null>;
  onKeep: () => void;
  onLeave: () => void;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>();
  useLayoutEffect(() => {
    const W = stage.current?.clientWidth ?? 0;
    const h = ref.current?.offsetHeight ?? 0;
    const width = ref.current?.offsetWidth ?? 260;
    const above = hover.top - h - 12;
    setPos({
      left: Math.max(8, Math.min(W - width - 8, hover.x - width / 2)),
      top: above >= 8 ? above : hover.bottom + 12,
    });
  }, [hover, stage]);
  return (
    <motion.div
      ref={ref}
      className="peek pool-card"
      data-pool-ui
      role="dialog"
      aria-label={`About “${hover.item.word}”`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      initial={{ opacity: 0, scale: 0.96, rotate: -0.8 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
      onMouseEnter={onKeep}
      onMouseLeave={onLeave}
    >
      <WordCard
        word={hover.item.word}
        item={hover.item}
        center={center}
        onOpen={onOpen}
      />
    </motion.div>
  );
}

function usePeek(word: string): Peek | "error" | undefined {
  const [info, setInfo] = useState<Peek | "error">();
  useEffect(() => {
    let active = true;
    setInfo(undefined);
    peek(word).then(
      (p) => active && setInfo(p),
      () => active && setInfo("error"),
    );
    return () => {
      active = false;
    };
  }, [word]);
  return info;
}

const RELATION = ["Same meaning as", "Explains", "Used with"] as const;

/** A word's details in the theme's card style: the middle word, a hovered word (desktop) or a tapped one (phones). */
function WordCard({
  word,
  item,
  center,
  onOpen,
  back,
  onBack,
  hint,
}: {
  word: string;
  item?: PoolItem;
  center?: string;
  onOpen?: () => void;
  back?: string;
  onBack?: () => void;
  hint?: string;
}) {
  const info = usePeek(word);
  const entries = useEntries();
  const { openQuickAdd } = useAppState();
  const inNotebook = entries?.some((e) => e.word === word);
  const p = info && info !== "error" ? info : undefined;
  return (
    <div className="pool-word-card">
      <div className="peek-head">
        <span
          className={`word-font peek-word-title${item ? "" : " pool-card-main"}`}
          lang="en"
        >
          {word}
        </span>
        <SpeakButton text={word} />
        <KBadge word={word} plain />
      </div>
      {info === undefined && (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          <span className="skeleton" style={{ width: "55%", height: 12 }} />
          <span className="skeleton" style={{ width: "85%", height: 12 }} />
        </div>
      )}
      {p && (p.ipa || p.partOfSpeech) && (
        <p className="faint small peek-meta">
          {p.partOfSpeech && <span className="peek-pos">{p.partOfSpeech}</span>}
          {p.ipa && <span>{p.ipa}</span>}
        </p>
      )}
      {info !== undefined && (
        <p className="peek-text clamp">
          {p?.definition ?? (
            <span className="faint">No short definition found.</span>
          )}
        </p>
      )}
      {item && center && (
        <p
          className="pool-relation"
          style={{ "--ring": RING_VARS[item.ring] } as React.CSSProperties}
        >
          <i /> {RELATION[item.ring]} <b className="word-font">{center}</b>
          {item.phrase && (
            <>
              {" · "}
              <span className="pool-phrase word-font">{item.phrase}</span>
            </>
          )}
        </p>
      )}
      {hint && <p className="faint small pool-card-hint">{hint}</p>}
      <div className="peek-actions">
        {back && onBack && (
          <button
            type="button"
            className="btn btn-quiet small pool-back"
            onClick={onBack}
          >
            <ArrowLeft size={14} /> {back}
          </button>
        )}
        {onOpen && (
          <button
            type="button"
            className="btn btn-quiet small"
            onClick={onOpen}
          >
            Its rings <ArrowRight size={14} />
          </button>
        )}
        {inNotebook ? (
          <Link to={wordPath(word)} className="btn btn-quiet small">
            In your notebook <ArrowRight size={14} />
          </Link>
        ) : (
          <>
            {!item && (
              <Link to={lookPath(word)} className="btn btn-quiet small">
                More <ArrowRight size={14} />
              </Link>
            )}
            <button
              type="button"
              className="btn small peek-add"
              onClick={() => openQuickAdd({ word, frequency: p?.frequency })}
            >
              <Plus size={14} /> Add
            </button>
          </>
        )}
      </div>
    </div>
  );
}
