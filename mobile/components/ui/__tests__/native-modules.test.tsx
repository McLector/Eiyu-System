import { screen } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Text } from 'react-native';
import PagerView from 'react-native-pager-view';

import { renderWithTheme } from '../test-theme';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// These modules are native: jest.setup.js replaces them so the suite (and CI) can load code that imports them.
describe('native modules under jest', () => {
  it('PagerView renders its pages', async () => {
    await renderWithTheme(
      <PagerView initialPage={0} style={{ flex: 1 }}>
        <Text key="a">Page A</Text>
        <Text key="b">Page B</Text>
      </PagerView>,
    );
    expect(screen.getByText('Page A')).toBeOnTheScreen();
    expect(screen.getByText('Page B')).toBeOnTheScreen();
  });

  it('the image picker resolves as cancelled, so nothing is uploaded by accident', async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'] });
    expect(result.canceled).toBe(true);
  });

  it('the video player can be created and played', async () => {
    function Probe() {
      const player = useVideoPlayer('https://example.invalid/clip.mp4', p => { p.play(); });
      return <VideoView player={player} testID="video" />;
    }
    await renderWithTheme(<Probe />);
    expect(screen.getByTestId('video')).toBeOnTheScreen();
  });
});
