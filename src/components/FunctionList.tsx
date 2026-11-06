import { useState } from "react";
import { ALL_FUNCTIONS } from "../engine/functions";

const CATEGORIES = ["Math", "Logical", "Lookup", "Text"] as const;

/** Side panel listing every supported function, with a search box. */
export function FunctionList() {
  const [search, setSearch] = useState("");
  const query = search.trim().toUpperCase();
  const matches = ALL_FUNCTIONS.filter(
    (fn) => fn.name.includes(query) || fn.description.toUpperCase().includes(query),
  );

  return (
    <aside className="function-list" aria-label="Supported functions">
      <div className="function-list-header">
        <h2>Functions ({ALL_FUNCTIONS.length})</h2>
        <input
          type="search"
          placeholder="Search functions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="function-list-body">
        {CATEGORIES.map((category) => {
          const inCategory = matches.filter((fn) => fn.category === category);
          if (inCategory.length === 0) return null;
          return (
            <section key={category}>
              <h3>{category}</h3>
              {inCategory.map((fn) => (
                <div className="function-item" key={fn.name}>
                  <code>{fn.syntax}</code>
                  <p>{fn.description}</p>
                </div>
              ))}
            </section>
          );
        })}
        {matches.length === 0 && <p className="muted">No functions match "{search}".</p>}
      </div>
    </aside>
  );
}
