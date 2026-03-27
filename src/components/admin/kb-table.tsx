"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { truncate, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

interface KBEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  source: string | null;
  isActive: boolean;
  createdAt: Date;
}

interface KBFormData {
  question: string;
  answer: string;
  category: string;
  source: "manual" | "imported" | "generated";
}

const emptyForm: KBFormData = {
  question: "",
  answer: "",
  category: "",
  source: "manual",
};

export function KbTable() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
  const [form, setForm] = useState<KBFormData>(emptyForm);

  const utils = api.useUtils();

  const { data, isLoading } = api.knowledge.list.useQuery({
    limit: 50,
    offset: 0,
  });

  const createEntry = api.knowledge.create.useMutation({
    onSuccess: async () => {
      toast.success("Entry created");
      await utils.knowledge.list.invalidate();
      closeDialog();
    },
    onError: () => toast.error("Failed to create entry"),
  });

  const updateEntry = api.knowledge.update.useMutation({
    onSuccess: async () => {
      toast.success("Entry updated");
      await utils.knowledge.list.invalidate();
      closeDialog();
    },
    onError: () => toast.error("Failed to update entry"),
  });

  const deleteEntry = api.knowledge.delete.useMutation({
    onSuccess: async () => {
      toast.success("Entry deleted");
      await utils.knowledge.list.invalidate();
    },
    onError: () => toast.error("Failed to delete entry"),
  });

  function openCreate() {
    setEditingEntry(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(entry: KBEntry) {
    setEditingEntry(entry);
    setForm({
      question: entry.question,
      answer: entry.answer,
      category: entry.category ?? "",
      source: (entry.source as KBFormData["source"]) ?? "manual",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingEntry(null);
    setForm(emptyForm);
  }

  function handleSubmit() {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error("Question and answer are required");
      return;
    }

    if (editingEntry) {
      updateEntry.mutate({
        id: editingEntry.id,
        question: form.question,
        answer: form.answer,
        category: form.category || undefined,
      });
    } else {
      createEntry.mutate({
        question: form.question,
        answer: form.answer,
        category: form.category || undefined,
        source: form.source,
      });
    }
  }

  const filtered = data?.filter(
    (e) =>
      e.question.toLowerCase().includes(search.toLowerCase()) ||
      e.answer.toLowerCase().includes(search.toLowerCase()) ||
      e.category?.toLowerCase().includes(search.toLowerCase())
  );

  const isPending = createEntry.isPending || updateEntry.isPending;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entries..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add entry
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Question</TableHead>
              <TableHead className="w-[35%]">Answer</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  No entries found.
                </TableCell>
              </TableRow>
            ) : (
              filtered?.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-sm font-medium">
                    {truncate(entry.question, 60)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {truncate(entry.answer, 60)}
                  </TableCell>
                  <TableCell>
                    {entry.category ? (
                      <Badge variant="outline" className="text-xs">
                        {entry.category}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {entry.source ?? "manual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(entry)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteEntry.mutate({ id: entry.id })}
                        disabled={deleteEntry.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit entry" : "Add KB entry"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question">Question</Label>
              <Input
                id="question"
                placeholder="What is your return policy?"
                value={form.question}
                onChange={(e) =>
                  setForm((f) => ({ ...f, question: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="answer">Answer</Label>
              <Textarea
                id="answer"
                placeholder="Our return policy allows..."
                rows={4}
                value={form.answer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, answer: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">
                Category{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="category"
                placeholder="e.g. returns, shipping, billing"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending
                ? "Saving..."
                : editingEntry
                  ? "Save changes"
                  : "Create entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}