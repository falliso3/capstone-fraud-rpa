# backend/app/reports/render.py

from pathlib import Path
from datetime import datetime, timezone

from jinja2 import Environment, FileSystemLoader

# Directory where we store report artifacts (same name as orchestrator)
ART_DIR = Path("run-artifacts")
ART_DIR.mkdir(exist_ok=True)

# Template directory inside the backend package
# /app/app/templates inside the Docker container
TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"

env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))


def render_markdown(payload: dict) -> str:
    """
    Create a short Markdown summary for a run, using the payload from build_latest_run_payload().
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    run_id = payload["run_id"]

    md_path = ART_DIR / f"report_{ts}_{run_id[:8]}.md"

    with md_path.open("w", encoding="utf-8") as f:
        f.write(f"# Fraud Run — {ts} (run_id: {run_id})\n\n")
        f.write(f"- Status: **{payload['status']}**\n")
        f.write(f"- Inserted: **{payload['inserted']}**\n")
        f.write(f"- Scored: **{payload['scored']}**\n")
        f.write(f"- Flagged: **{payload['flagged']}**\n")
        f.write(f"- Total transactions (this run): **{payload['total_transactions']}**\n\n")

        f.write("## Metrics\n")
        f.write(f"- Flag rate: **{payload['metrics']['flag_rate_percent']}%**\n")
        f.write(f"- Avg score: **{payload['metrics']['avg_score']}**\n")

    return str(md_path)


def render_html(payload: dict) -> str:
    """
    Render an HTML metrics report using Jinja2 and the existing report_template.html.

    For now, we just plug in flag_rate and avg_score as the 'metrics' table,
    and we use a simple placeholder confusion matrix. In a future sprint we can
    replace this with real confusion-matrix counts from the metrics table.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    run_id = payload["run_id"]

    html_path = ART_DIR / f"report_{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}_{run_id[:8]}.html"

    # Metrics to show in the HTML table.
    metrics = {
        "flag_rate": payload["metrics"]["flag_rate_percent"],
        "avg_score": payload["metrics"]["avg_score"],
    }

    # Very simple placeholder confusion matrix HTML.
    cm_html = """
    <div class="placeholder">
      Confusion matrix coming in a future sprint (will use model metrics table).
    </div>
    """

    # cm_max is required by the template; 0 for now since this is a placeholder.
    cm_max = 0

    template = env.get_template("report_template.html")
    html = template.render(
        timestamp=ts,
        metrics=metrics,
        cm_html=cm_html,
        cm_max=cm_max,
    )

    with html_path.open("w", encoding="utf-8") as f:
        f.write(html)

    return str(html_path)
