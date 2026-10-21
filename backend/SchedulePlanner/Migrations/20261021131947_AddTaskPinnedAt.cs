using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchedulePlanner.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskPinnedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "PinnedAt",
                table: "Tasks",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PinnedAt",
                table: "Tasks");
        }
    }
}
