using System.Text.Json.Serialization;

namespace SchedulePlanner.Models;

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // "#rrggbb", or null for an unstyled tag chip.
    public string? Color { get; set; }

    // Hidden tags stay attached to their tasks but are left out of the
    // tag pickers' default list (they still show up when searched for).
    public bool IsHidden { get; set; }

    [JsonIgnore]
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}
