using System;
using System.Collections.Generic;

namespace GreenRhino
{
    /// <summary>窗口角色：控制各窗口承载的界面与行为。</summary>
    public enum WindowRole { Hub, Music, Video }

    /// <summary>按扩展名对双击/关联文件做音频/视频分类，用于窗口分流。</summary>
    public static class WindowRoleExt
    {
        public static readonly HashSet<string> AudioExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            ".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".wma", ".mp2", ".mp1", ".aiff", ".mka", ".ape" };

        public static readonly HashSet<string> VideoExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            ".mp4", ".mkv", ".webm", ".mov", ".avi", ".m4v", ".ogv", ".ts", ".flv", ".wmv" };

        public static bool IsAudio(string path) { try { return AudioExts.Contains(System.IO.Path.GetExtension(path)); } catch { return false; } }
        public static bool IsVideo(string path) { try { return VideoExts.Contains(System.IO.Path.GetExtension(path)); } catch { return false; } }
    }
}