import { Box, Text, useInput } from "ink";

// Rows above the first item inside the dropdown: top border + title.
export const DROPDOWN_LIST_OFFSET = 2;

export type DropdownItem<T extends string> = {
  value: T;
  label: string;
  note: string;
};

type Props<T extends string> = {
  title: string;
  items: DropdownItem<T>[];
  current: T;
  width: number;
  index: number;
  setIndex: (update: (i: number) => number) => void;
  onPick: (value: T) => void;
  onClose: () => void;
};

// A small menu that opens under a header label: the mode picker and the model picker.
export function Dropdown<T extends string>({ title, items, current, width, index, setIndex, onPick, onClose }: Props<T>) {
  useInput((_input, key) => {
    if (key.upArrow) setIndex((i) => Math.max(i - 1, 0));
    else if (key.downArrow) setIndex((i) => Math.min(i + 1, items.length - 1));
    else if (key.return) onPick(items[index]!.value);
    else if (key.escape) onClose();
  });

  const labelWidth = Math.max(...items.map((item) => item.label.length)) + 2;

  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {title}
      </Text>
      {items.map((item, i) => (
        <Text key={item.value} inverse={i === index} wrap="truncate-end">
          {item.value === current ? "● " : "  "}
          {item.label.padEnd(labelWidth)}
          <Text dimColor>{item.note}</Text>
        </Text>
      ))}
      <Text dimColor>click/↑↓ · ⏎ pick · esc close</Text>
    </Box>
  );
}
