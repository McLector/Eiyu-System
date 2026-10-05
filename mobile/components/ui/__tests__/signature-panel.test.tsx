import { screen } from '@testing-library/react-native';
import { PALETTE_TOKENS } from '@eiyu/shared';
import { Text } from 'react-native';

import { SignaturePanel } from '../signature-panel';
import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T = PALETTE_TOKENS.cyan.dark;
const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
const corner = (name: (typeof CORNERS)[number]) => screen.getByTestId(`panel-corner-${name}`, { includeHiddenElements: true });

describe('SignaturePanel', () => {
  it('renders what it frames', async () => {
    await renderWithTheme(<SignaturePanel><Text>Pay attention</Text></SignaturePanel>);
    expect(screen.getByText('Pay attention')).toBeOnTheScreen();
  });

  it('is a flat panel with a hairline border from the palette', async () => {
    await renderWithTheme(<SignaturePanel testID="panel"><Text>x</Text></SignaturePanel>);
    expect(screen.getByTestId('panel')).toHaveStyle({ backgroundColor: T['panel-flat'], borderColor: T['panel-border'], borderWidth: 1, borderRadius: 4 });
  });

  it('draws four corner brackets in the accent colour', async () => {
    await renderWithTheme(<SignaturePanel><Text>x</Text></SignaturePanel>);
    for (const name of CORNERS) expect(corner(name)).toHaveStyle({ borderColor: T.accent });
  });

  it('puts each bracket on its own corner', async () => {
    await renderWithTheme(<SignaturePanel><Text>x</Text></SignaturePanel>);
    expect(corner('tl')).toHaveStyle({ top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 });
    expect(corner('tr')).toHaveStyle({ top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 });
    expect(corner('bl')).toHaveStyle({ bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 });
    expect(corner('br')).toHaveStyle({ bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 });
  });

  it('lets a tint replace both the border and the brackets', async () => {
    await renderWithTheme(<SignaturePanel testID="panel" tint="#ff00aa"><Text>x</Text></SignaturePanel>);
    expect(screen.getByTestId('panel')).toHaveStyle({ borderColor: '#ff00aa' });
    for (const name of CORNERS) expect(corner(name)).toHaveStyle({ borderColor: '#ff00aa' });
  });

  it('hides the brackets from screen readers and keeps them out of touch handling', async () => {
    await renderWithTheme(<SignaturePanel><Text>x</Text></SignaturePanel>);
    for (const name of CORNERS) expect(screen.queryByTestId(`panel-corner-${name}`)).toBeNull();
    expect(corner('tl')).toHaveProp('pointerEvents', 'none');
  });

  it('follows the palette', async () => {
    await renderWithTheme(<SignaturePanel testID="panel"><Text>x</Text></SignaturePanel>, { palette: 'violet', mode: 'light' });
    expect(screen.getByTestId('panel')).toHaveStyle({ borderColor: PALETTE_TOKENS.violet.light['panel-border'] });
    expect(corner('tl')).toHaveStyle({ borderColor: PALETTE_TOKENS.violet.light.accent });
  });
});
