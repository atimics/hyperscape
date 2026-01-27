/**
 * BuildingGenPage
 * Page for procedural building and town generation
 */

import React, { useState, useCallback, Suspense } from "react";
import { Building2, MapPin, Download, RefreshCw } from "lucide-react";

// Lazy load the viewers to avoid SSR issues with Three.js
const BuildingViewer = React.lazy(() =>
  import("@hyperscape/procgen/building/viewer").then((m) => ({
    default: m.BuildingViewer,
  })),
);
const TownViewer = React.lazy(() =>
  import("@hyperscape/procgen/building/viewer").then((m) => ({
    default: m.TownViewer,
  })),
);

type ViewMode = "building" | "town";

export const BuildingGenPage: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("town");
  const [key, setKey] = useState(0);

  const handleRegenerate = useCallback(() => {
    setKey((k) => k + 1);
  }, []);

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <Building2 size={28} />
            Building & Town Generator
          </h1>
          <p className="text-text-secondary mt-1">
            Generate procedural buildings and complete towns with various
            layouts
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-bg-tertiary rounded-lg p-1">
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === "building"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setViewMode("building")}
            >
              <Building2 size={16} className="inline mr-2" />
              Single Building
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === "town"
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-text-primary"
              }`}
              onClick={() => setViewMode("town")}
            >
              <MapPin size={16} className="inline mr-2" />
              Town Layout
            </button>
          </div>

          <button
            onClick={handleRegenerate}
            className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary hover:bg-bg-secondary rounded-lg text-text-secondary hover:text-text-primary transition-all"
          >
            <RefreshCw size={18} />
            Reset View
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 bg-bg-secondary rounded-xl overflow-hidden border border-border-primary">
        <Suspense
          fallback={
            <div className="w-full h-full flex items-center justify-center text-text-secondary">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
                <span>
                  Loading {viewMode === "building" ? "Building" : "Town"}{" "}
                  Generator...
                </span>
              </div>
            </div>
          }
        >
          {viewMode === "building" ? (
            <BuildingViewer
              key={`building-${key}`}
              width="100%"
              height="100%"
              showStats
              showControls
              backgroundColor={0x1a1a2e}
            />
          ) : (
            <TownViewer
              key={`town-${key}`}
              width="100%"
              height="100%"
              showStats
              showControls
              backgroundColor={0x1a1a2e}
            />
          )}
        </Suspense>
      </div>

      {/* Info Panel */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
          <h3 className="font-semibold text-text-primary mb-2">
            Building Types
          </h3>
          <p className="text-sm text-text-secondary">
            Generate 9 building types: banks, stores, inns, smithies, houses,
            and more. Each with unique layouts, rooms, and props.
          </p>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
          <h3 className="font-semibold text-text-primary mb-2">Town Sizes</h3>
          <p className="text-sm text-text-secondary">
            <strong>Hamlet:</strong> 3-5 buildings, 40m safe zone
            <br />
            <strong>Village:</strong> 6-10 buildings, 60m safe zone
            <br />
            <strong>Town:</strong> 11-16 buildings, 80m safe zone
          </p>
        </div>
        <div className="bg-bg-secondary rounded-lg p-4 border border-border-primary">
          <h3 className="font-semibold text-text-primary mb-2">
            Deterministic
          </h3>
          <p className="text-sm text-text-secondary">
            Use seeds for reproducible results. Same seed always generates the
            same buildings and town layouts.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BuildingGenPage;
