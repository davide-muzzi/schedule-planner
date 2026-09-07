using System.Text.Json.Serialization;

namespace SchedulePlanner.Models;

public class Tag
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    // "#rrggbb", or null for an unstyled tag chip.
    public string? Color { get; set; }

    [JsonIgnore]
    public ICollection<TaskItem> Tasks { get; set; } = new List<TaskItem>();
}
