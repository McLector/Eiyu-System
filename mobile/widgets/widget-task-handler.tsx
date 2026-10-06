import React from 'react';
import { FlexWidget, TextWidget, type WidgetTaskHandlerProps } from 'react-native-android-widget';

// Build spike only: a fixed widget that proves headless rendering and the deep link on a real build. Replaced in step 3.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  props.renderWidget(
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'eiyusystem://board?lane=daily' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#050b14', padding: 12, justifyContent: 'center' }}>
      <TextWidget text="EIYU spike" style={{ fontSize: 18, color: '#67e8f9' }} />
      <TextWidget text={`drawn ${new Date().toISOString().slice(11, 19)}`} style={{ fontSize: 12, color: '#dff0fb' }} />
    </FlexWidget>,
  );
}
