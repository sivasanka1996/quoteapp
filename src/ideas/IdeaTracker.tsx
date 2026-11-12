import { useMemo, useState } from "react";
import {
  IDEA_STATUSES,
  IDEA_STATUS_LABEL,
  IDEA_SERVICES,
  IDEA_SERVICE_LABEL,
  ideaService,
  type IdeaStatus,
  type IdeaService,
} from "../types";
import { useIdeas } from "./useIdeas";
import { formatDate } from "../format";
import "./IdeaTracker.css";

interface Props {
  onBack: () => void;
}

type Filter = "all" | IdeaStatus;

export function IdeaTracker({ onBack }: Props) {
  const { ideas, loading, addIdea, setStatus, setService, deleteIdea } = useIdeas();
  const [text, setText] = useState("");
  const [newService, setNewService] = useState<IdeaService>("general");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? ideas : ideas.filter((i) => i.status === filter)),
    [ideas, filter]
  );

  const groups = useMemo(() => {
    const byService = new Map<IdeaService, typeof visible>();
    for (const s of IDEA_SERVICES) byService.set(s, []);
    for (const idea of visible) byService.get(ideaService(idea))!.push(idea);
    return IDEA_SERVICES.map((s) => [s, byService.get(s)!] as const).filter(
      ([, items]) => items.length > 0
    );
  }, [visible]);

  async function handleAdd() {
    if (!text.trim()) return;
    setAdding(true);
    await addIdea(text, newService);
    setAdding(false);
    setText("");
  }

  return (
    <div className="it">
      <div className="it-top">
        <button className="it-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="it-ident">
          <h1>Idea Tracker</h1>
          <p className="it-ident-meta">
            {loading
              ? "Loading ideas…"
              : `${ideas.length} idea${ideas.length === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <div className="it-add">
        <input
          className="it-add-input"
          value={text}
          placeholder="Drop in a new idea…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <select
          className="it-add-service"
          value={newService}
          onChange={(e) => setNewService(e.target.value as IdeaService)}
          aria-label="Service for new idea"
        >
          {IDEA_SERVICES.map((s) => (
            <option key={s} value={s}>
              {IDEA_SERVICE_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          className="it-add-btn"
          onClick={handleAdd}
          disabled={!text.trim() || adding}
        >
          {adding ? "Adding…" : "+ Add Idea"}
        </button>
      </div>

      <div className="it-list-head">
        <h2>All Ideas</h2>
        <label className="it-filter">
          <FilterIcon />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter ideas by status"
          >
            <option value="all">All statuses</option>
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {IDEA_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="it-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="it-skel" key={i} />
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="it-empty">
          <p className="it-empty-title">No ideas yet</p>
          <p className="it-empty-sub">Drop in the first one above.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="it-empty">
          <p className="it-empty-title">
            No {filter === "all" ? "" : IDEA_STATUS_LABEL[filter].toLowerCase()} ideas
          </p>
          <button className="it-empty-clear" onClick={() => setFilter("all")}>
            Show all ideas
          </button>
        </div>
      ) : (
        groups.map(([service, items]) => (
          <div className="it-group" key={service}>
            <div className="it-group-head">
              <h3>{IDEA_SERVICE_LABEL[service]}</h3>
              <span className="it-group-count">{items.length}</span>
            </div>
            <div className="it-list">
              {items.map((idea) => (
                <div className="it-row" key={idea.id}>
                  <div className="it-row-body">
                    <span className="it-row-text">{idea.text}</span>
                    <div className="it-row-meta-line">
                      <span className="it-row-meta">{formatDate(idea.createdAt)}</span>
                      <select
                        className="it-row-service"
                        value={ideaService(idea)}
                        onChange={(e) => setService(idea.id, e.target.value as IdeaService)}
                        aria-label="Move idea to a different service"
                      >
                        {IDEA_SERVICES.map((s) => (
                          <option key={s} value={s}>
                            {IDEA_SERVICE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="it-sp" role="group" aria-label="Idea status">
                      {IDEA_STATUSES.map((s) => (
                        <button
                          key={s}
                          className={`it-sp-btn it-sp-${s} ${idea.status === s ? "is-active" : ""}`}
                          aria-pressed={idea.status === s}
                          onClick={() => setStatus(idea.id, s)}
                        >
                          {IDEA_STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {deleteConfirm === idea.id ? (
                    <div className="it-confirm">
                      <span>Delete this idea?</span>
                      <button
                        className="it-del-yes"
                        onClick={() => {
                          deleteIdea(idea.id);
                          setDeleteConfirm(null);
                        }}
                      >
                        Delete
                      </button>
                      <button className="it-del-no" onClick={() => setDeleteConfirm(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="it-del-btn"
                      onClick={() => setDeleteConfirm(idea.id)}
                      aria-label="Delete idea"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 6h16l-6 7v6l-4-2v-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
