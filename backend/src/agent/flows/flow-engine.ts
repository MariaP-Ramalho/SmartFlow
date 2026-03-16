import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  FlowTemplate,
  FlowState,
  FlowNode,
  FlowHistoryEntry,
} from './flow.interface';

@Injectable()
export class FlowEngine {
  private readonly logger = new Logger(FlowEngine.name);
  private readonly templatesDir = path.join(__dirname, 'templates');
  private readonly templateCache = new Map<string, FlowTemplate>();

  loadTemplate(templateId: string): FlowTemplate {
    const cached = this.templateCache.get(templateId);
    if (cached) return cached;

    const filePath = path.join(this.templatesDir, `${templateId}.json`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `Flow template "${templateId}" not found at ${filePath}`,
      );
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const template: FlowTemplate = JSON.parse(raw);
      this.templateCache.set(templateId, template);
      this.logger.log(`Loaded flow template: ${template.name}`);
      return template;
    } catch (error) {
      throw new Error(
        `Failed to parse flow template "${templateId}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  startFlow(templateId: string): { state: FlowState; currentNode: FlowNode } {
    const template = this.loadTemplate(templateId);

    const state: FlowState = {
      templateId,
      currentNodeId: template.startNodeId,
      collectedData: {},
      history: [],
      status: 'in_progress',
    };

    const currentNode = this.getNodeById(template, template.startNodeId);

    state.history.push({
      nodeId: currentNode.id,
      timestamp: new Date(),
    });

    return { state, currentNode };
  }

  processResponse(
    state: FlowState,
    response: string,
  ): { state: FlowState; currentNode: FlowNode; isComplete: boolean } {
    const template = this.loadTemplate(state.templateId);
    const current = this.getNodeById(template, state.currentNodeId);

    state.collectedData[current.id] = response;

    const lastEntry = state.history[state.history.length - 1];
    if (lastEntry && lastEntry.nodeId === current.id) {
      lastEntry.response = response;
    }

    const nextNodeId = this.resolveNextNode(current, response);

    if (!nextNodeId) {
      state.status = 'completed';
      return { state, currentNode: current, isComplete: true };
    }

    const nextNode = this.getNodeById(template, nextNodeId);
    state.currentNodeId = nextNodeId;

    const entry: FlowHistoryEntry = {
      nodeId: nextNodeId,
      timestamp: new Date(),
    };
    state.history.push(entry);

    if (nextNode.type === 'end') {
      state.status = 'completed';
      return { state, currentNode: nextNode, isComplete: true };
    }

    return { state, currentNode: nextNode, isComplete: false };
  }

  getCurrentNode(state: FlowState): FlowNode {
    const template = this.loadTemplate(state.templateId);
    return this.getNodeById(template, state.currentNodeId);
  }

  getFlowSummary(state: FlowState): {
    templateId: string;
    status: FlowState['status'];
    stepsCompleted: number;
    collectedData: Record<string, any>;
    path: string[];
  } {
    return {
      templateId: state.templateId,
      status: state.status,
      stepsCompleted: state.history.length,
      collectedData: state.collectedData,
      path: state.history.map((h) => h.nodeId),
    };
  }

  listTemplates(): FlowTemplate[] {
    if (!fs.existsSync(this.templatesDir)) return [];

    return fs
      .readdirSync(this.templatesDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const id = f.replace('.json', '');
        return this.loadTemplate(id);
      });
  }

  private getNodeById(template: FlowTemplate, nodeId: string): FlowNode {
    const node = template.nodes.find((n) => n.id === nodeId);
    if (!node) {
      throw new NotFoundException(
        `Node "${nodeId}" not found in template "${template.id}"`,
      );
    }
    return node;
  }

  private resolveNextNode(
    current: FlowNode,
    response: string,
  ): string | undefined {
    if (current.options?.length) {
      const match = current.options.find(
        (o) => o.value.toLowerCase() === response.toLowerCase(),
      );
      if (match) return match.nextNodeId;
    }

    return current.next;
  }
}
