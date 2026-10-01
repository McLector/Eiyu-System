import { useCallback, useEffect } from 'react';
import { useAudioPlayer } from 'expo-audio';

const completionCue = require('../assets/completion.wav');

/** One quiet, bundled cue. The hook owns player creation and disposal. */
export function useCompletionSound(): () => void {
  const player = useAudioPlayer(completionCue);

  useEffect(() => {
    player.volume = 0.35;
  }, [player]);

  return useCallback(() => {
    void (async () => {
      try {
        await player.seekTo(0);
        player.play();
      } catch {
        // Audio output is optional; never block a saved quest transition.
      }
    })();
  }, [player]);
}
