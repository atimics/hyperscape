// Navigation view type used for route mapping
export type NavigationView =
  | "assets"
  | "generation"
  | "equipment"
  | "handRigging"
  | "armorFitting"
  | "retargetAnimate"
  | "worldBuilder"
  | "worldEditor" // New: Uses real game systems
  | "manifests"
  | "buildingGen"
  | "treeGen"
  // leafClusterGen removed - consolidated into treeGen
  | "rockGen"
  | "plantGen"
  | "terrainGen"
  | "roadsGen"
  | "grassGen"
  | "flowerGen"
  | "vegetationGen";
