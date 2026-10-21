namespace SchedulePlanner.Models;

// Join row between a task and one of its tags. Explicit (rather than the
// implicit join EF would generate) so it can carry Position - the order the
// tags were added in, which a plain many-to-many has no way to remember.
// Column names match the previous implicit join table, so existing links
// carry over as-is.
public class TaskTag
{
    public int TasksId { get; set; }
    public TaskItem Task { get; set; } = null!;

    public int TagsId { get; set; }
    public Tag Tag { get; set; } = null!;

    // 0-based position within the task's tag list.
    public int Position { get; set; }
}
