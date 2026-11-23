import { Box, Text } from "ink";

// Your avatar, top left of the full-screen UI: a red tile with a white face.
// Half-block characters (▄ ▀ ▐ ▌) make the edges look rounded.
export const AVATAR_ROWS = 4;

// Exact colours. Named colours like "redBright" depend on the terminal's theme
// (yours showed it as orange), so we give the RGB values instead.
const RED = "#Ffffff";
const WHITE = "#FFFFFF";

export function Avatar() {
  return (
    <Box flexDirection="column">
      <Text color={RED}>{"   ▄▄▄▄▄▄▄   "}</Text>
      <Text>
        <Text color={RED}>{" ▐"}</Text>
        <Text backgroundColor={RED} color={WHITE} bold>
          {"  ◕   ◕  "}
        </Text>
        <Text color={RED}>{"▌ "}</Text>
      </Text>
      <Text>
        <Text color={RED}>{" ▐"}</Text>
        <Text backgroundColor={RED} color={WHITE} bold>
          {"    ᴗ    "}
        </Text>
        <Text color={RED}>{"▌ "}</Text>
      </Text>
      <Text color={RED}>{"   ▀▀▀▀▀▀▀   "}</Text>
    </Box>
  );
}
