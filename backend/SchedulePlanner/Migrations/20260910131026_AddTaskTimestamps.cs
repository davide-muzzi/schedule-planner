using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SchedulePlanner.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskTimestamps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CompletedAt",
                table: "Tasks",
                type: "TEXT",
                nullable: true);

            // SQLite rejects a non-constant default (CURRENT_TIMESTAMP)
            // directly on ALTER TABLE ADD COLUMN ("Cannot add a column with
            // non-constant default"), so these two use EF's own placeholder
            // constant to satisfy that NOT NULL add, then the UPDATE right
            // below backfills every pre-existing row to the actual moment
            // this migration runs - the honest floor for "we don't know
            // exactly when, but no earlier than this." A plain UPDATE has no
            // such restriction on CURRENT_TIMESTAMP.
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Tasks",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<DateTime>(
                name: "LastUpdatedAt",
                table: "Tasks",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.Sql("UPDATE Tasks SET CreatedAt = CURRENT_TIMESTAMP, LastUpdatedAt = CURRENT_TIMESTAMP;");

            // CompletedAt stays NULL for every pre-existing row (no default
            // at all above), then this backfills it only for tasks that are
            // already Done (status ordinal 2 - see TaskItemStatus) -
            // everything else genuinely has no completion date and should
            // stay NULL.
            migrationBuilder.Sql("UPDATE Tasks SET CompletedAt = CURRENT_TIMESTAMP WHERE Status = 2;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "LastUpdatedAt",
                table: "Tasks");
        }
    }
}
