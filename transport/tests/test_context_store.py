"""Tests for ConversationContextStore persistence and retrieval logic."""

import json
from pathlib import Path

import pytest

from tunapi.context import RunContext

from tunadish_transport.context_store import ConversationContextStore


# ---------------------------------------------------------------------------
# set_context / get_context
# ---------------------------------------------------------------------------


async def test_set_and_get_context_roundtrip(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """A context written with set_context is returned verbatim by get_context."""
    await store.set_context("conv-1", sample_context)

    result = await store.get_context("conv-1")

    assert result is not None
    assert result.project == "my-project"
    assert result.branch == "main"


async def test_get_context_missing_returns_none(
    store: ConversationContextStore,
) -> None:
    """get_context returns None when the conversation ID does not exist."""
    result = await store.get_context("nonexistent-id")

    assert result is None


async def test_set_context_preserves_label_on_update(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """Re-setting a context without a label keeps the original label."""
    await store.set_context("conv-1", sample_context, label="My Chat")

    updated_context = RunContext(project="my-project", branch="feature-x")
    await store.set_context("conv-1", updated_context)  # no label supplied

    conversations = store.list_conversations()
    assert conversations[0]["label"] == "My Chat"


async def test_set_context_label_can_be_overridden(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """Supplying a new label on update replaces the old one."""
    await store.set_context("conv-1", sample_context, label="Old Label")
    await store.set_context("conv-1", sample_context, label="New Label")

    conversations = store.list_conversations()
    assert conversations[0]["label"] == "New Label"


# ---------------------------------------------------------------------------
# list_conversations
# ---------------------------------------------------------------------------


async def test_list_conversations_returns_all(
    store: ConversationContextStore,
) -> None:
    """list_conversations returns every stored conversation when no filter is given."""
    await store.set_context("conv-a", RunContext(project="proj-a"), label="A")
    await store.set_context("conv-b", RunContext(project="proj-b"), label="B")

    result = store.list_conversations()

    ids = {item["id"] for item in result}
    assert ids == {"conv-a", "conv-b"}


async def test_list_conversations_filtered_by_project(
    store: ConversationContextStore,
) -> None:
    """list_conversations with project= only returns matching conversations."""
    await store.set_context("conv-a", RunContext(project="proj-a"), label="A")
    await store.set_context("conv-b", RunContext(project="proj-b"), label="B")
    await store.set_context("conv-c", RunContext(project="proj-a"), label="C")

    result = store.list_conversations(project="proj-a")

    ids = {item["id"] for item in result}
    assert ids == {"conv-a", "conv-c"}
    assert all(item["project"] == "proj-a" for item in result)


async def test_list_conversations_sorted_newest_first(
    store: ConversationContextStore,
) -> None:
    """list_conversations returns entries sorted by created_at descending."""
    # Insert sequentially; created_at is set from time.time() on first set_context call.
    # Inject deterministic timestamps via the internal cache directly to avoid
    # relying on wall-clock ordering within the same event loop tick.
    await store.set_context("conv-old", RunContext(project="p"), label="old")
    await store.set_context("conv-new", RunContext(project="p"), label="new")

    store._cache["conv-old"].created_at = 1000.0  # type: ignore[attr-defined]
    store._cache["conv-new"].created_at = 2000.0  # type: ignore[attr-defined]

    result = store.list_conversations()

    assert result[0]["id"] == "conv-new"
    assert result[1]["id"] == "conv-old"


# ---------------------------------------------------------------------------
# set_active_branch
# ---------------------------------------------------------------------------


async def test_set_active_branch_updates_meta(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """set_active_branch persists the branch_id on the conversation."""
    await store.set_context("conv-1", sample_context)
    await store.set_active_branch("conv-1", "branch-abc")

    assert store._cache["conv-1"].active_branch_id == "branch-abc"


async def test_set_active_branch_noop_for_missing_conv(
    store: ConversationContextStore,
) -> None:
    """set_active_branch on a nonexistent conversation raises no error."""
    # Should complete without raising.
    await store.set_active_branch("does-not-exist", "branch-xyz")


async def test_set_active_branch_reset_to_none(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """Passing None to set_active_branch clears the active branch."""
    await store.set_context("conv-1", sample_context)
    await store.set_active_branch("conv-1", "branch-abc")
    await store.set_active_branch("conv-1", None)

    assert store._cache["conv-1"].active_branch_id is None


# ---------------------------------------------------------------------------
# clear
# ---------------------------------------------------------------------------


async def test_clear_removes_conversation(
    store: ConversationContextStore,
    sample_context: RunContext,
) -> None:
    """clear removes the entry from both cache and persisted storage."""
    await store.set_context("conv-1", sample_context)
    await store.clear("conv-1")

    assert await store.get_context("conv-1") is None
    assert store.list_conversations() == []


async def test_clear_noop_for_missing_conv(
    store: ConversationContextStore,
) -> None:
    """clear on a nonexistent conversation completes without raising."""
    await store.clear("never-existed")


# ---------------------------------------------------------------------------
# Persistence round-trip
# ---------------------------------------------------------------------------


async def test_persistence_roundtrip(
    tmp_path: Path,
    sample_context: RunContext,
) -> None:
    """Data saved by one store instance is correctly loaded by a fresh instance."""
    storage_file = tmp_path / "store.json"

    store_a = ConversationContextStore(storage_file)
    await store_a.set_context("conv-1", sample_context, label="Persisted Chat")
    await store_a.set_active_branch("conv-1", "branch-99")

    # Load a second store instance from the same file.
    store_b = ConversationContextStore(storage_file)

    result = await store_b.get_context("conv-1")
    assert result is not None
    assert result.project == "my-project"
    assert result.branch == "main"

    conversations = store_b.list_conversations()
    assert len(conversations) == 1
    assert conversations[0]["label"] == "Persisted Chat"

    # active_branch_id must survive round-trip too.
    assert store_b._cache["conv-1"].active_branch_id == "branch-99"


# ---------------------------------------------------------------------------
# Missing file init
# ---------------------------------------------------------------------------


def test_init_with_nonexistent_file_starts_empty(tmp_path: Path) -> None:
    """Constructing a store when the storage file does not exist yields an empty cache."""
    storage_file = tmp_path / "subdir" / "missing.json"

    store = ConversationContextStore(storage_file)

    assert store.list_conversations() == []


def test_init_with_corrupt_json_starts_empty(tmp_path: Path) -> None:
    """A corrupt storage file is tolerated; the store starts with an empty cache."""
    storage_file = tmp_path / "store.json"
    storage_file.write_text("{ not valid json }", "utf-8")

    store = ConversationContextStore(storage_file)

    assert store.list_conversations() == []


async def test_save_creates_parent_directories(tmp_path: Path) -> None:
    """_save creates any missing parent directories before writing."""
    storage_file = tmp_path / "a" / "b" / "store.json"

    store = ConversationContextStore(storage_file)
    await store.set_context("conv-1", RunContext(project="p"))

    assert storage_file.exists()
    data = json.loads(storage_file.read_text("utf-8"))
    assert "conv-1" in data["conversations"]
