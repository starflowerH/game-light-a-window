# 证据登记模板

每个来源单独复制一份。

```yaml
id: S001
title: ""
authors: []
year:
type: meta_analysis | rct | longitudinal | cross_sectional | qualitative | theory | policy | news | report
population: ""
sample_size: ""
intervention_or_exposure: ""
comparison: ""
outcomes: []
effect_size: ""
main_findings: []
limitations: []
relevance_to_game: ""
mechanism: []
evidence_grade: A | B | C | D
doi: ""
pmid: ""
url: ""
access: full_text | abstract_only | unavailable
verified_by: ""
verification_date: ""
notes: ""
```

## 证据等级建议

- **A**：多项 RCT/元分析，结果较一致，可直接作为设计依据，但仍不能宣称疗效。
- **B**：单项 RCT、较强纵向研究或多项一致观察研究，可谨慎使用。
- **C**：横断研究、质性研究、理论推导，适合生成假设。
- **D**：新闻、评论、个人经验、网络热词，只能作为语境素材。

## 机制登记模板

```yaml
mechanism: ""
theory: ""
evidence_grade: ""
game_action: ""
feedback: ""
fun_score: 1-5
implementation_cost: 1-5
risk: ""
mvp_priority: P0 | P1 | P2
```
