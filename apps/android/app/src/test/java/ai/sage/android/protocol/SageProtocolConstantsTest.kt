package ai.sage.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class SageProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", SageCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", SageCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", SageCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", SageCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", SageCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", SageCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", SageCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", SageCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", SageCapability.Canvas.rawValue)
    assertEquals("camera", SageCapability.Camera.rawValue)
    assertEquals("screen", SageCapability.Screen.rawValue)
    assertEquals("voiceWake", SageCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", SageScreenCommand.Record.rawValue)
  }
}
