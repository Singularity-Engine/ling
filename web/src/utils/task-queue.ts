/* eslint-disable no-promise-executor-return */
/* eslint-disable arrow-parens */
import { createLogger } from '@/utils/logger';

const log = createLogger('TaskQueue');

export class TaskQueue {
  private queue: (() => Promise<void>)[] = [];

  private running = false;

  private taskInterval: number;

  private activeTasks = new Set<Promise<void>>();

  /** Resolvers for waitForCompletion() — notified when the queue drains. */
  private drainResolvers: (() => void)[] = [];

  constructor(taskIntervalMs = 3000) {
    this.taskInterval = taskIntervalMs;
  }

  addTask(task: () => Promise<void>) {
    this.queue.push(task);
    this.runNextTask();
  }

  clearQueue() {
    this.queue = [];
    this.activeTasks.clear();
    this.running = false;
    this.notifyDrain();
  }

  private async runNextTask() {
    if (this.running || this.queue.length === 0) {
      if (this.queue.length === 0 && this.activeTasks.size === 0) {
        this.notifyDrain();
      }
      return;
    }

    this.running = true;
    const task = this.queue.shift();
    if (task) {
      const taskPromise = task();
      this.activeTasks.add(taskPromise);

      try {
        await taskPromise;
        await new Promise(resolve => setTimeout(resolve, this.taskInterval));
      } catch (error) {
        log.error('Task execution failed:', error);
      } finally {
        this.activeTasks.delete(taskPromise);
        this.running = false;
        this.runNextTask();
      }
    }
  }

  public hasTask(): boolean {
    return this.queue.length > 0 || this.activeTasks.size > 0 || this.running;
  }

  /**
   * Returns a promise that resolves when the queue is fully drained.
   * Uses event-driven notification instead of polling.
   */
  public waitForCompletion(): Promise<void> {
    if (!this.hasTask()) return Promise.resolve();
    return new Promise(resolve => { this.drainResolvers.push(resolve); });
  }

  private notifyDrain() {
    if (this.drainResolvers.length === 0) return;
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    for (const resolve of resolvers) resolve();
  }
}

export const audioTaskQueue = new TaskQueue(20);
