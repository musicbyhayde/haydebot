"""Fix #12: selects are paginated past PostgREST's 1000-row cap."""
from unittest.mock import patch

import pytest

from app.services.supabase_service import SupabaseService

MAX_ROWS = 1000  # what Supabase returns at most per request


class FakeQuery:
    """Minimal postgrest-like builder over an in-memory table, honouring the row cap."""
    def __init__(self, rows, log):
        self.rows, self.log, self.filters, self.rng = rows, log, [], None

    def select(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self
    def neq(self, col, val): self.filters.append(lambda r: r.get(col) != val); return self
    def eq(self, col, val): self.filters.append(lambda r: r.get(col) == val); return self
    def gte(self, *_a): return self
    def contains(self, col, val): self.filters.append(lambda r: set(val) <= set(r.get(col) or [])); return self
    @property
    def not_(self): return self
    def is_(self, col, _v): self.filters.append(lambda r: r.get(col) is not None); return self
    def range(self, a, b):
        assert self.rng is None, "builder reused across pages"
        self.rng = (a, b); return self

    def execute(self):
        data = [r for r in self.rows if all(f(r) for f in self.filters)]
        a, b = self.rng if self.rng else (0, MAX_ROWS - 1)
        self.log.append(self.rng)
        class R: pass
        r = R(); r.data = data[a:min(b + 1, a + MAX_ROWS)]
        return r


class FakeClient:
    def __init__(self, tables):
        self.tables, self.log = tables, []
    def table(self, name):
        return FakeQuery(self.tables.get(name, []), self.log)


@pytest.fixture
def svc():
    s = SupabaseService.__new__(SupabaseService)
    leads = [{"id": f"rec{i:05d}", "Status": "Closed" if i % 3 == 0 else "Talking", "Phone": str(i)}
             for i in range(2500)]
    finance = [{"id": f"f{i}", "Owner": "אילן" if i % 2 else "קובי", "Amount": 1, "Type": "income"}
               for i in range(2300)]
    tasks = [{"id": f"t{i}", "Lead_ID": f"rec{i:05d}", "Is_Completed": True} for i in range(2500)]
    s.client = FakeClient({"leads": leads, "finance": finance, "tasks": tasks})
    return s


def test_get_all_leads_returns_everything(svc):
    assert len(svc.get_all_leads()) == 2500
    assert svc.client.log[:3] == [(0, 999), (1000, 1999), (2000, 2999)]


def test_get_active_leads_returns_everything(svc):
    assert len(svc.get_active_leads()) == 2500 - len(range(0, 2500, 3))


def test_finance_entries_all_pages(svc):
    assert len(svc.get_finance_entries()) == 2300
    assert len(svc.get_finance_entries(owner="אילן")) == 1150


def test_finance_summary_counts_all_rows(svc):
    summary = svc.get_finance_summary()
    total_income = sum(v["income"] for v in summary.values())
    assert total_income == 2300


def test_orphan_cleanup_does_not_delete_tasks_of_existing_leads(svc):
    orig_table = svc.client.table

    def table(name):
        q = orig_table(name)
        q.delete = lambda: (_ for _ in ()).throw(AssertionError("must not delete"))
        q.in_ = lambda *a: q
        q.update = lambda *a: q
        return q

    with patch.object(svc.client, "table", side_effect=table):
        res = svc.cleanup_orphaned_tasks()
    assert res["deleted"] == 0


def test_exact_page_boundary(svc):
    svc.client.tables["leads"] = [{"id": f"r{i}", "Status": "New"} for i in range(2000)]
    assert len(svc.get_all_leads()) == 2000
