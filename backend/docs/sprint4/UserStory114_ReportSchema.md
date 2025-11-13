# User Story #114 – Design Report Schema

**Goal:**  
Define the data fields that make up a “run report” so we can later render it in both Markdown and HTML.

---

## Purpose 
This schema describes the summary card the anyone can read after each fraud-detection run.  
It lets anyone see what happened — how many transactions were ingested, how many were flagged, average score, and overall status — without needing to manually count anything in the database.

---

## Report Schema (Fields)

| Field Name                      | Description                                                | Source / Notes                               |
|---------------------------------|------------------------------------------------------------|----------------------------------------------|
| `run_id`                        | Unique ID of this fraud-detection run                      | from `rpa_runs` table                        |
| `started_at`                    | Timestamp when the orchestrator started                    | from `rpa_runs.started_at`                   |
| `finished_at`                   | Timestamp when the run completed                           | from `rpa_runs.finished_at`                  |
| `status`                        | `success`, `failed`, `running`, etc.                       | from `rpa_runs.status`                       |
| `inserted`                      | # of transactions inserted                                 | from `rpa_runs.inserted`                     |
| `scored`                        | # of transactions scored                                   | from `rpa_runs.scored`                       |
| `flagged`                       | # of transactions flagged as fraud                         | from `rpa_runs.flagged`                      |
| `total_transactions`            | total count of transactions in DB tied to this run         | derived live via query                       |
| `flag_rate`                     | `flagged / scored` × 100 (%)                               | derived live via query                       |
| `avg_score`                     | average fraud score of all transactions in this run        | derived live via query                       |
| *(optional)* `confusion_matrix` | TP/FP/TN/FN counts for model evaluation                    | future extension using `metrics` table       |
| *(optional)* `metrics_table`    | precision, recall, F1, etc.                                | future extension                             |

---

## Example Markdown Snippet (Prototype)
```markdown
### Fraud Run Report – 2025-11-07
**Run ID:** 7f3a-ab2e  
**Status:**  Success  
**Started:** 2025-11-07 12:32 UTC  
**Finished:** 2025-11-07 12:33 UTC  

|         Metric        | Value |
|-----------------------|-------|
| Transactions inserted | 9 827 |
| Transactions scored   | 9 827 |
| Transactions flagged  | 162   |
| Flag rate             | 1.65 %|
| Average score         | 0.47  |
