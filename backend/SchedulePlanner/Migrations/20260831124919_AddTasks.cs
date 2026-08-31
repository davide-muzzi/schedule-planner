using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchedulePlanner.Migrations
{
    /// <inheritdoc />
    public partial class AddTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TaskItemId",
                table: "ScheduleEntries",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Tasks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    EstimatedMinutes = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tasks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleEntries_TaskItemId",
                table: "ScheduleEntries",
                column: "TaskItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_ScheduleEntries_Tasks_TaskItemId",
                table: "ScheduleEntries",
                column: "TaskItemId",
                principalTable: "Tasks",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ScheduleEntries_Tasks_TaskItemId",
                table: "ScheduleEntries");

            migrationBuilder.DropTable(
                name: "Tasks");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleEntries_TaskItemId",
                table: "ScheduleEntries");

            migrationBuilder.DropColumn(
                name: "TaskItemId",
                table: "ScheduleEntries");
        }
    }
}
