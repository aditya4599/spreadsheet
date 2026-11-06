import { useRef, useState } from "react";
import { ErrorDetails } from "./components/ErrorDetails";
import { FormulaBar } from "./components/FormulaBar";
import { FunctionList } from "./components/FunctionList";
import { Grid } from "./components/Grid";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { useSpreadsheet } from "./hooks/useSpreadsheet";

export default function App() {
  const controller = useSpreadsheet();
  const gridRef = useRef<HTMLDivElement>(null);
  const [showFunctions, setShowFunctions] = useState(false);

  const focusGrid = () => gridRef.current?.focus();

  return (
    <div className="app">
      <Toolbar
        controller={controller}
        showFunctions={showFunctions}
        onToggleFunctions={() => setShowFunctions((shown) => !shown)}
      />
      <FormulaBar controller={controller} focusGrid={focusGrid} />
      <ErrorDetails controller={controller} />
      <main className="workspace">
        <Grid controller={controller} containerRef={gridRef} />
        {showFunctions && <FunctionList />}
      </main>
      <StatusBar controller={controller} />
    </div>
  );
}
