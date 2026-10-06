import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

/** A widget is drawn by native code, so tests read it as a React element tree instead of rendering it. */
export type WidgetElement = ReactElement<Record<string, unknown>>;

export function elementsOf(node: ReactNode): WidgetElement[] {
  const found: WidgetElement[] = [];
  const visit = (value: ReactNode) => {
    Children.forEach(value, child => {
      if (!isValidElement<Record<string, unknown>>(child)) return;
      found.push(child);
      visit(child.props.children as ReactNode);
    });
  };
  visit(node);
  return found;
}

/** Every text the widget shows, in reading order. */
export function textsOf(node: ReactNode): string[] {
  return elementsOf(node)
    .map(element => element.props.text)
    .filter((text): text is string => typeof text === 'string');
}

export function styleOf(element: WidgetElement): Record<string, unknown> {
  return (element.props.style as Record<string, unknown> | undefined) ?? {};
}

export function elementWithText(node: ReactNode, text: string): WidgetElement {
  const element = elementsOf(node).find(item => item.props.text === text);
  if (!element) throw new Error(`No widget text "${text}" in: ${JSON.stringify(textsOf(node))}`);
  return element;
}
