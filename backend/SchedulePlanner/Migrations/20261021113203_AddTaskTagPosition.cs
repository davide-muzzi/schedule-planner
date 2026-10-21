using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchedulePlanner.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskTagPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Position",
                table: "TaskTags",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Position",
                table: "TaskTags");
        }
    }
}
