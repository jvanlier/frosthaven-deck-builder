import BB from "./BB.json" with { type: "json" };
import BN from "./BN.json" with { type: "json" };
import BO from "./BO.json" with { type: "json" };
import CR from "./CR.json" with { type: "json" };
import DF from "./DF.json" with { type: "json" };
import DT from "./DT.json" with { type: "json" };
import DW from "./DW.json" with { type: "json" };
import FF from "./FF.json" with { type: "json" };
import GE from "./GE.json" with { type: "json" };
import HV from "./HV.json" with { type: "json" };
import IF from "./IF.json" with { type: "json" };
import ME from "./ME.json" with { type: "json" };
import PC from "./PC.json" with { type: "json" };
import PY from "./PY.json" with { type: "json" };
import SD from "./SD.json" with { type: "json" };
import SH from "./SH.json" with { type: "json" };
import TA from "./TA.json" with { type: "json" };
import AN from "./AN.json" with { type: "json" };
import CA from "./CA.json" with { type: "json" };
import HA from "./HA.json" with { type: "json" };
import SA from "./SA.json" with { type: "json" };
import type { Character } from "../../character.js";

export const characterGroups = [
  {
    name: "Frosthaven",
    characters: [
      BB,
      BN,
      BO,
      CR,
      DF,
      DT,
      DW,
      FF,
      GE,
      HV,
      IF,
      ME,
      PC,
      PY,
      SD,
      SH,
      TA,
    ] as Character[],
  },
  {
    name: "Mercenary Pack",
    characters: [AN, CA, HA, SA] as Character[],
  },
];

export const characters = characterGroups.flatMap((group) => group.characters);

export function getCharacter(id: string): Character | undefined {
  return characters.find((character) => character.id === id);
}
