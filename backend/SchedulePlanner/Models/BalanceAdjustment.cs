using System.ComponentModel.DataAnnotations;

namespace SchedulePlanner.Models;

public class BalanceAdjustment
{
    public int Id { get; set; }

    [Range(-525600, 525600)]
    public int TotalMinutes { get; set; }
}
