using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchedulePlanner.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskPriority : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "IsImportant",
                table: "Tasks",
                newName: "Priority");

            // The rename alone leaves old IsImportant=true (stored as 1) reading
            // back as Priority.Low - remap it to Priority.High (3) instead, the
            // intended one-time backfill for the old binary flag.
            migrationBuilder.Sql("UPDATE \"Tasks\" SET \"Priority\" = 3 WHERE \"Priority\" = 1;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"Tasks\" SET \"Priority\" = 1 WHERE \"Priority\" IN (1, 2, 3);");

            migrationBuilder.RenameColumn(
                name: "Priority",
                table: "Tasks",
                newName: "IsImportant");
        }
    }
}
