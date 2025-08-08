import React, { useState } from 'react';
import { 
  Plus, 
  Square,
  CheckSquare,
  Clock, 
  Trash2,
  ChevronDown,
  ChevronRight,
  ListTodo,
  Zap,
  Trophy
} from 'lucide-react';
import { useStore } from '../../stores/useStore';
import './TodoPanel.css';

export const TodoPanel: React.FC = () => {
  const { todos, addTodo, updateTodoStatus, deleteTodo } = useStore();
  const [newTodo, setNewTodo] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const pendingTodos = todos.filter(t => t.status === 'pending');
  const inProgressTodos = todos.filter(t => t.status === 'in_progress');
  const completedTodos = todos.filter(t => t.status === 'completed');

  const handleAddTodo = () => {
    if (newTodo.trim()) {
      addTodo(newTodo);
      setNewTodo('');
    }
  };

  const toggleSection = (section: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(section)) {
      newCollapsed.delete(section);
    } else {
      newCollapsed.add(section);
    }
    setCollapsedSections(newCollapsed);
  };

  const getStatusIcon = (status: string, isHovered?: boolean) => {
    switch (status) {
      case 'pending':
        return isHovered ? <Square size={18} className="checkbox-icon" /> : <Square size={18} className="checkbox-icon" />;
      case 'in_progress':
        return <Clock size={18} className="animate-spin-slow" />;
      case 'completed':
        return <CheckSquare size={18} className="checkbox-icon filled" />;
      default:
        return <Square size={18} className="checkbox-icon" />;
    }
  };

  const getSectionIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ListTodo size={16} />;
      case 'in_progress':
        return <Zap size={16} />;
      case 'completed':
        return <Trophy size={16} />;
      default:
        return <ListTodo size={16} />;
    }
  };

  const getNextStatus = (currentStatus: string): 'pending' | 'in_progress' | 'completed' => {
    switch (currentStatus) {
      case 'pending':
        return 'in_progress';
      case 'in_progress':
        return 'completed';
      case 'completed':
        return 'pending';
      default:
        return 'pending';
    }
  };

  return (
    <div className="todo-panel">
      <div className="todo-input">
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
        />
        <button onClick={handleAddTodo}>
          <Plus size={16} />
        </button>
      </div>

      <div className="todo-sections">
        {/* Pending Section */}
        <div className="todo-section pending-section">
          <button 
            className="section-header"
            onClick={() => toggleSection('pending')}
          >
            {collapsedSections.has('pending') ? 
              <ChevronRight size={16} /> : 
              <ChevronDown size={16} />
            }
            <div className="section-icon pending">
              {getSectionIcon('pending')}
            </div>
            <span className="section-title">Pending</span>
            <span className="section-count pending">{pendingTodos.length}</span>
          </button>
          
          {!collapsedSections.has('pending') && (
            <div className="todo-list">
              {pendingTodos.map((todo) => (
                <div key={todo.id} className="todo-item pending">
                  <button
                    className="todo-checkbox pending"
                    onClick={() => updateTodoStatus(todo.id, getNextStatus(todo.status))}
                    title="Click to start"
                  >
                    {getStatusIcon(todo.status)}
                  </button>
                  <span className="todo-content">{todo.content}</span>
                  <button
                    className="todo-delete"
                    onClick={() => deleteTodo(todo.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* In Progress Section */}
        <div className="todo-section in-progress-section">
          <button 
            className="section-header"
            onClick={() => toggleSection('in_progress')}
          >
            {collapsedSections.has('in_progress') ? 
              <ChevronRight size={16} /> : 
              <ChevronDown size={16} />
            }
            <div className="section-icon in-progress">
              {getSectionIcon('in_progress')}
            </div>
            <span className="section-title">In Progress</span>
            <span className="section-count in-progress">{inProgressTodos.length}</span>
          </button>
          
          {!collapsedSections.has('in_progress') && (
            <div className="todo-list">
              {inProgressTodos.map((todo) => (
                <div key={todo.id} className="todo-item in-progress">
                  <button
                    className="todo-checkbox in-progress"
                    onClick={() => updateTodoStatus(todo.id, getNextStatus(todo.status))}
                    title="Click to complete"
                  >
                    {getStatusIcon(todo.status)}
                  </button>
                  <span className="todo-content">{todo.content}</span>
                  <button
                    className="todo-delete"
                    onClick={() => deleteTodo(todo.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Completed Section */}
        <div className="todo-section completed-section">
          <button 
            className="section-header"
            onClick={() => toggleSection('completed')}
          >
            {collapsedSections.has('completed') ? 
              <ChevronRight size={16} /> : 
              <ChevronDown size={16} />
            }
            <div className="section-icon completed">
              {getSectionIcon('completed')}
            </div>
            <span className="section-title">Completed</span>
            <span className="section-count completed">{completedTodos.length}</span>
          </button>
          
          {!collapsedSections.has('completed') && (
            <div className="todo-list">
              {completedTodos.map((todo) => (
                <div key={todo.id} className="todo-item completed">
                  <button
                    className="todo-checkbox completed"
                    onClick={() => updateTodoStatus(todo.id, getNextStatus(todo.status))}
                    title="Click to reset"
                  >
                    {getStatusIcon(todo.status)}
                  </button>
                  <span className="todo-content">{todo.content}</span>
                  <button
                    className="todo-delete"
                    onClick={() => deleteTodo(todo.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {todos.length === 0 && (
        <div className="todo-empty">
          <ListTodo size={32} className="empty-icon" />
          <p>No tasks yet</p>
          <span className="empty-hint">Add your first task above 📝</span>
        </div>
      )}
    </div>
  );
};