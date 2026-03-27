"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, X, Bot, Save } from "lucide-react";

interface AgentFormData {
  id?: string;
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  tools: string[];
}

const emptyForm: AgentFormData = {
  name: "",
  description: "",
  systemPrompt: "You are a helpful virtual assistant.",
  model: "gpt-4o",
  temperature: 70,
  tools: [],
};

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o mini" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export function AgentForm() {
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<AgentFormData>(emptyForm);

  const utils = api.useUtils();

  const { data: agents, isLoading: agentsLoading } = api.agent.list.useQuery();
  const { data: availableTools } = api.agent.availableTools.useQuery();

  const createAgent = api.agent.create.useMutation({
    onSuccess: async () => {
      toast.success("Agent created");
      await utils.agent.list.invalidate();
      resetForm();
    },
    onError: () => toast.error("Failed to create agent"),
  });

  const updateAgent = api.agent.update.useMutation({
    onSuccess: async () => {
      toast.success("Agent updated");
      await utils.agent.list.invalidate();
    },
    onError: () => toast.error("Failed to update agent"),
  });

  const deactivateAgent = api.agent.deactivate.useMutation({
    onSuccess: async () => {
      toast.success("Agent deactivated");
      await utils.agent.list.invalidate();
      resetForm();
    },
    onError: () => toast.error("Failed to deactivate agent"),
  });

  function selectAgent(agentId: string) {
    const agent = agents?.find((a) => a.id === agentId);
    if (!agent) return;
    setSelected(agentId);
    setForm({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? "",
      systemPrompt: "",   // not returned in list — fetch separately if needed
      model: agent.model,
      temperature: 70,
      tools: (agent.tools as string[]) ?? [],
    });
  }

  function resetForm() {
    setSelected(null);
    setForm(emptyForm);
  }

  function toggleTool(toolName: string) {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(toolName)
        ? f.tools.filter((t) => t !== toolName)
        : [...f.tools, toolName],
    }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      toast.error("Name and system prompt are required");
      return;
    }

    if (form.id) {
      updateAgent.mutate({
        id: form.id,
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        model: form.model,
        temperature: form.temperature,
        tools: form.tools,
      });
    } else {
      createAgent.mutate({
        name: form.name,
        description: form.description,
        systemPrompt: form.systemPrompt,
        model: form.model,
        temperature: form.temperature,
        tools: form.tools,
      });
    }
  }

  const isPending = createAgent.isPending || updateAgent.isPending;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Agent list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Agents</span>
          <Button size="sm" variant="outline" onClick={resetForm}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {agentsLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))
          ) : agents?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No agents yet. Create one.
            </p>
          ) : (
            agents?.map((agent) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                  selected === agent.id
                    ? "border-primary bg-accent"
                    : "border-border"
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {agent.model}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Agent form */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">
            {form.id ? "Edit agent" : "New agent"}
          </CardTitle>
          <CardDescription>
            Configure the agent's identity, model, and available tools.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Name + description */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Support Agent"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">
                Description{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="description"
                placeholder="Handles customer support queries"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>

          {/* System prompt */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="systemPrompt">System prompt</Label>
            <Textarea
              id="systemPrompt"
              placeholder="You are a helpful assistant that..."
              rows={5}
              value={form.systemPrompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, systemPrompt: e.target.value }))
              }
            />
          </div>

          {/* Model + temperature */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="temperature">
                Temperature{" "}
                <span className="text-muted-foreground">
                  ({(form.temperature / 100).toFixed(2)})
                </span>
              </Label>
              <input
                id="temperature"
                type="range"
                min={0}
                max={100}
                value={form.temperature}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temperature: Number(e.target.value),
                  }))
                }
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Tools */}
          <div className="flex flex-col gap-2">
            <Label>Tools</Label>
            <div className="flex flex-wrap gap-2">
              {availableTools?.map((tool) => {
                const isActive = form.tools.includes(tool.name);
                return (
                  <button
                    key={tool.name}
                    onClick={() => toggleTool(tool.name)}
                    title={tool.description}
                    className="focus:outline-none"
                  >
                    <Badge
                      variant={isActive ? "default" : "outline"}
                      className="cursor-pointer select-none gap-1"
                    >
                      {isActive && <X className="h-2.5 w-2.5" />}
                      {tool.name}
                    </Badge>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Click to toggle. Active tools are highlighted.
            </p>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex items-center justify-between">
            {form.id && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  form.id && deactivateAgent.mutate({ id: form.id })
                }
                disabled={deactivateAgent.isPending}
              >
                Deactivate agent
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              {form.id && (
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {isPending ? "Saving..." : form.id ? "Save changes" : "Create agent"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}