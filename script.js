const API_BASE_URL = "http://127.0.0.1:8000/api/";
let activeContextMenu = null;

document.addEventListener("click", (e) => {
  if (activeContextMenu) {
    if (!document.body.contains(activeContextMenu)) {
      console.log(`activeContextMenu (${activeContextMenu.id}) больше не в DOM, очищаем`);
      activeContextMenu = null;
      return;
    }
    const moreBtn = activeContextMenu.moreBtn;
    console.log(`Глобальный клик: target=${e.target.tagName}, class=${e.target.className}, contains=${activeContextMenu.contains(e.target)}, isMoreBtn=${e.target === moreBtn}`);
    if (!activeContextMenu.contains(e.target) && e.target !== moreBtn) {
      console.log(`Закрытие контекстного меню ${activeContextMenu.id}`);
      activeContextMenu.classList.remove("active");
      activeContextMenu = null;
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded, initializing board...");
  loadBoard();

  document.querySelectorAll(".menu button").forEach(button => {
    button.addEventListener("click", () => {
      const teamId = button.getAttribute("data-team");
      switchBoard(teamId);
    });
  });
});

let currentTeamId = 1;

async function switchBoard(teamId) {
  currentTeamId = parseInt(teamId.replace("team", ""));
  await loadBoard();
}

let isLoadingBoard = false;

async function loadBoard() {
  if (isLoadingBoard) return;
  isLoadingBoard = true;

  const board = document.getElementById("kanbanBoard");
  board.innerHTML = "";

  try {
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to load columns: ${response.status}`);
    const columns = await response.json();

    console.log("Загруженные колонки:", columns);
    columns.sort((a, b) => a.order - b.order); // Сортировка по серверному order

    // Создаём массив элементов колонок
    const columnElements = await Promise.all(
      columns.map(async (column) => {
        const columnElement = await createColumnElement(column);
        return columnElement;
      })
    );

    // Добавляем колонки в DOM в правильном порядке
    columnElements.forEach(columnElement => board.appendChild(columnElement));

    // Добавление кнопки и поля ввода
    const addColumnBtn = document.createElement("button");
    addColumnBtn.classList.add("add-column-btn");
    addColumnBtn.textContent = "Добавить колонку";
    board.appendChild(addColumnBtn);

    const newColumnInputContainer = document.createElement("div");
    newColumnInputContainer.classList.add("new-column-input-container");
    newColumnInputContainer.style.display = "none";
    newColumnInputContainer.innerHTML = `
      <input type="text" class="new-column-input" placeholder="Введите название колонки...">
    `;
    board.appendChild(newColumnInputContainer);

    const input = newColumnInputContainer.querySelector(".new-column-input");
    addColumnBtn.addEventListener("click", () => {
      addColumnBtn.style.display = "none";
      newColumnInputContainer.style.display = "block";
      input.focus();
    });

    input.addEventListener("blur", async () => {
      if (input.value.trim()) {
        await addColumn(input.value.trim());
        input.value = "";
      }
      newColumnInputContainer.style.display = "none";
      addColumnBtn.style.display = "block";
    });

    board.addEventListener("dragover", (e) => e.preventDefault());
  } catch (error) {
    console.error("Ошибка при загрузке доски:", error);
    board.innerHTML = "<p>Ошибка загрузки доски. Попробуйте позже.</p>";
  } finally {
    isLoadingBoard = false;
  }
}

async function addColumn(status) {
  if (!status || !status.trim()) return;
  try {
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, order: document.querySelectorAll(".column").length }),
    });
    if (!response.ok) throw new Error(`Failed to add column: ${response.status}`);
    await loadBoard();
  } catch (error) {
    console.error("Ошибка при добавлении колонки:", error);
  }
}

async function updateColumn(columnId) {
  const columnElement = document.querySelector(`.column[data-column-id="${columnId}"]`);
  if (!columnElement) {
    console.warn(`Колонка с ID ${columnId} не найдена в DOM`);
    return;
  }

  try {
    const tasksResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!tasksResponse.ok) throw new Error(`Failed to load tasks: ${tasksResponse.status}`);
    const tasks = await tasksResponse.json();
    console.log(`Задачи для колонки ${columnId}:`, tasks);

    const taskList = columnElement.querySelector(".task-list");
    // Очистка activeContextMenu перед обновлением DOM
    if (activeContextMenu) {
      activeContextMenu.classList.remove("active");
      activeContextMenu = null;
    }
    taskList.innerHTML = ""; // Очищаем список задач
    tasks.sort((a, b) => a.order - b.order);

    tasks.forEach(task => {
      const taskElement = createTaskElement(task, taskList);
      taskList.appendChild(taskElement);
      attachTaskEventListeners(taskElement, task.id);
    });

    console.log(`Колонка ${columnId} обновлена, задач: ${tasks.length}, IDs: ${tasks.map(t => t.id).join(", ")}`);
  } catch (error) {
    console.error(`Ошибка при обновлении колонки ${columnId}:`, error);
    alert("Не удалось обновить колонку. Попробуйте снова.");
  }
}

async function createColumnElement(column) {
  const columnElement = document.createElement("div");
  columnElement.classList.add("column");
  columnElement.setAttribute("draggable", "true");
  columnElement.setAttribute("data-column-id", column.id);

  try {
    const tasksResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${column.id}/tasks/`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!tasksResponse.ok) throw new Error(`Failed to load tasks: ${tasksResponse.status}`);
    const tasks = await tasksResponse.json();

    columnElement.innerHTML = `
      <div class="column-header">
        ${column.status}
        <button class="more-btn">⋮</button>
      </div>
      <div class="task-list"></div>
      <button class="add-task-btn">Добавить задачу</button>
      <div class="new-task-input-container" style="display: none;">
        <input type="text" class="new-task-input" placeholder="Добавить задачу...">
      </div>
      <div class="context-menu" id="column-context-menu-${column.id}">
        <button class="rename-btn" data-action="rename-column" data-id="${column.id}">Переименовать колонку</button>
        <button class="delete-btn" data-action="delete-column" data-id="${column.id}">Удалить колонку</button>
      </div>
    `;

    const taskList = columnElement.querySelector(".task-list");
    tasks.forEach(task => {
      const taskElement = createTaskElement(task, taskList);
      taskList.appendChild(taskElement);
      attachTaskEventListeners(taskElement, task.id); // Привязываем обработчики
    });

    // Остальной код для колонки (drag-and-drop, more-btn для колонки и т.д.) остаётся без изменений
    columnElement.addEventListener("dragstart", (e) => {
      const draggingTask = document.querySelector(".task.dragging");
      if (draggingTask) {
        e.preventDefault();
        return;
      }
      columnElement.classList.add("dragging");
      e.dataTransfer.setData("column-id", column.id);
      console.log(`Начало перетаскивания колонки ${column.id}`);
    });

    columnElement.addEventListener("dragend", () => {
      columnElement.classList.remove("dragging");
      console.log(`Конец перетаскивания колонки ${column.id}`);
    });

    columnElement.addEventListener("dragover", (e) => {
      e.preventDefault();
      const draggingTask = document.querySelector(".task.dragging");
      if (draggingTask) columnElement.classList.add("drag-over");
    });

    columnElement.addEventListener("dragleave", () => {
      columnElement.classList.remove("drag-over");
    });

    columnElement.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedColumnId = e.dataTransfer.getData("column-id");
      const draggedTaskId = e.dataTransfer.getData("task-id");
      const targetColumnId = parseInt(columnElement.getAttribute("data-column-id"));

      if (draggedColumnId) {
        handleColumnDrop(parseInt(draggedColumnId), targetColumnId);
      } else if (draggedTaskId) {
        handleColumnTaskDrop(parseInt(draggedTaskId), targetColumnId);
      }
    });

    columnElement.addEventListener("dragenter", (e) => {
      e.preventDefault();
      columnElement.classList.add("drag-over");
    });

    columnElement.addEventListener("dragleave", () => {
      columnElement.classList.remove("drag-over");
    });

    const moreBtn = columnElement.querySelector(".more-btn");
    moreBtn.addEventListener("click", (e) => toggleColumnContextMenu(e, column.id));

    const addTaskBtn = columnElement.querySelector(".add-task-btn");
    const newTaskInputContainer = columnElement.querySelector(".new-task-input-container");
    const input = columnElement.querySelector(".new-task-input");

    addTaskBtn.addEventListener("click", () => {
      addTaskBtn.style.display = "none";
      newTaskInputContainer.style.display = "block";
      input.focus();
    });

    input.addEventListener("blur", async () => {
      if (input.value.trim()) {
        await addTask(column.id, input.value.trim());
        input.value = "";
      }
      newTaskInputContainer.style.display = "none";
      addTaskBtn.style.display = "block";
    });

    const contextMenuButtons = columnElement.querySelectorAll(".context-menu button");
    contextMenuButtons.forEach(button => {
      button.addEventListener("click", (e) => {
        const action = e.target.getAttribute("data-action");
        const columnId = parseInt(e.target.getAttribute("data-id"));
        switch (action) {
          case "rename-column":
            renameColumn(columnId);
            break;
          case "delete-column":
            deleteColumn(columnId);
            break;
        }
      });
    });

    return columnElement;
  } catch (error) {
    console.error(`Ошибка при загрузке задач для колонки ${column.id}:`, error);
    return columnElement;
  }
}

async function addTask(columnId, taskName) {
  if (!taskName || !taskName.trim()) {
    console.log("Название задачи не введено");
    return;
  }
  try {
    const task = {
      name: taskName,
      description: "",
      due_date: null,
      completed: false,
      assignees: [],
      images: [],
      order: 0,
    };
    console.log(`Добавляем задачу в колонку ${columnId}`);
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!response.ok) throw new Error(`Failed to add task: ${response.status}`);
    const newTask = await response.json();
    console.log("Задача добавлена:", newTask);

    await updateColumn(columnId);
    console.log(`Колонка ${columnId} обновлена`);
  } catch (error) {
    console.error("Ошибка при добавлении задачи:", error);
    alert("Не удалось добавить задачу. Попробуйте снова.");
  }
}

async function renameColumn(columnId) {
  const columnElement = document.querySelector(`.column[data-column-id="${columnId}"]`);
  const header = columnElement.querySelector(".column-header");
  const currentName = header.childNodes[0].textContent.trim();

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.classList.add("new-column-input");
  header.innerHTML = "";
  header.appendChild(input);
  input.focus();

  input.addEventListener("blur", async () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      try {
        const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newName }),
        });
        if (!response.ok) throw new Error(`Failed to rename column: ${response.status}`);
        await loadBoard();
      } catch (error) {
        console.error("Ошибка при переименовании колонки:", error);
        await loadBoard(); // Восстанавливаем в случае ошибки
      }
    } else {
      await loadBoard();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
}

function createTaskElement(task, taskList) {
  console.log("Создание элемента для задачи:", task);

  const taskElement = document.createElement("div");
  taskElement.classList.add("task");
  taskElement.setAttribute("draggable", "true");
  taskElement.setAttribute("data-task-id", task.id);

  let dueDateText = '';
  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    dueDateText = `Дедлайн: ${dueDate.toLocaleDateString()}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today && !task.completed) {
      taskElement.classList.add("overdue");
      dueDateText += ' (просрочено)';
    }
  }

  taskElement.innerHTML = `
    <div class="task-header">
      <input type="checkbox" class="task-checkbox" ${task.completed ? "checked" : ""}>
      <span class="task-name">${task.name}</span>
      <button class="more-btn">⋮</button>
    </div>
    <div class="description${task.description ? ' visible' : ''}">${task.description || ''}</div>
    ${dueDateText ? `<div class="due-date">${dueDateText}</div>` : ''}
    <div class="task-assignees"></div>
    <div class="context-menu" id="task-context-menu-${task.id}">
      <button class="edit-btn" data-action="edit" data-id="${task.id}">Редактировать описание</button>
      <button class="rename-btn" data-action="rename" data-id="${task.id}">Переименовать</button>
      <button class="delete-btn" data-action="delete" data-id="${task.id}">Удалить</button>
      <button class="edit-due-date-btn" data-action="edit-due-date" data-id="${task.id}">Изменить дедлайн</button>
    </div>
  `;

  const assigneesDiv = taskElement.querySelector(".task-assignees");
  if (task.assignees && task.assignees.length > 0) {
    task.assignees.forEach(assignee => {
      const avatar = document.createElement("div");
      avatar.classList.add("task-assignee-avatar");
      avatar.textContent = assignee.charAt(0);
      avatar.title = assignee;
      assigneesDiv.appendChild(avatar);
    });
  }

  if (task.completed) taskElement.classList.add("completed");

  return taskElement; // Возвращаем элемент без обработчиков
}


async function openTaskModal(taskId) {
  const modal = document.getElementById("taskModal");
  try {
    const columnId = await findColumnIdForTask(taskId);
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`);
    if (!response.ok) throw new Error(`Failed to load task: ${response.status}`);
    const task = await response.json();

    modal.querySelector(".modal-title").textContent = task.name;
    modal.querySelector(".modal-description").value = task.description || "";
    modal.querySelector(".modal-due-date").value = task.due_date ? task.due_date.slice(0, 10) : "";

    const assigneesDiv = modal.querySelector(".modal-assignees");
    assigneesDiv.innerHTML = "";
    (task.assignees || []).forEach(assignee => {
      const avatar = document.createElement("div");
      avatar.classList.add("modal-assignee-avatar");
      avatar.textContent = assignee.charAt(0);
      avatar.title = assignee;
      avatar.onclick = async () => {
        task.assignees = task.assignees.filter(a => a !== assignee);
        await updateTaskViaAPI(taskId, columnId, { assignees: task.assignees });
        openTaskModal(taskId);
      };
      assigneesDiv.appendChild(avatar);
    });

    const imagesDiv = modal.querySelector(".modal-images");
    imagesDiv.innerHTML = "";
    (task.images || []).forEach(imageUrl => {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.classList.add("modal-image");
      imagesDiv.appendChild(img);
    });

    modal.style.display = "flex";
    setTimeout(() => modal.classList.add("active"), 10);

    const closeModal = () => {
      modal.classList.remove("active");
      setTimeout(() => (modal.style.display = "none"), 300);
    };
    modal.querySelector(".modal-close").onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    modal.querySelector(".modal-add-assignee-btn").onclick = () => {
      const picker = document.getElementById("assigneePicker");
      const assigneeList = picker.querySelector(".assignee-list");
      assigneeList.innerHTML = "";

      users.forEach(user => {
        const option = document.createElement("div");
        option.classList.add("assignee-option");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = user;
        checkbox.checked = task.assignees && task.assignees.includes(user);
        option.appendChild(checkbox);
        option.appendChild(document.createTextNode(user));
        assigneeList.appendChild(option);
      });

      picker.style.display = "flex";
      setTimeout(() => picker.classList.add("active"), 10);

      const closePicker = () => {
        picker.classList.remove("active");
        setTimeout(() => (picker.style.display = "none"), 300);
      };
      picker.querySelector(".assignee-picker-close").onclick = closePicker;
      picker.onclick = (e) => {
        if (e.target === picker) closePicker();
      };

      picker.querySelector(".assignee-picker-save").onclick = async () => {
        const selectedAssignees = Array.from(assigneeList.querySelectorAll("input[type='checkbox']:checked"))
          .map(input => input.value);
        task.assignees = selectedAssignees;
        await updateTaskViaAPI(taskId, columnId, { assignees: task.assignees });
        closePicker();
        openTaskModal(taskId);
      };
    };

    modal.querySelector(".modal-add-image").onclick = () => {
      const fileInput = modal.querySelector(".modal-image-upload");
      const file = fileInput.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          task.images = task.images || [];
          task.images.push(e.target.result);
          await updateTaskViaAPI(taskId, columnId, { images: task.images });
          const img = document.createElement("img");
          img.src = e.target.result;
          img.classList.add("modal-image");
          imagesDiv.appendChild(img);
          fileInput.value = "";
        };
        reader.readAsDataURL(file);
      }
    };

    modal.querySelector(".modal-save").onclick = async () => {
      task.description = modal.querySelector(".modal-description").value.trim();
      task.due_date = modal.querySelector(".modal-due-date").value ? `${modal.querySelector(".modal-due-date").value}T00:00:00` : null;
      await updateTaskViaAPI(taskId, columnId, {
        description: task.description,
        due_date: task.due_date,
      });
      closeModal();
      await loadBoard();
    };
  } catch (error) {
    console.error("Ошибка при открытии модального окна:", error);
  }
}

// Вспомогательная функция для обновления задачи через API
async function updateTaskViaAPI(taskId, columnId, updates) {
  try {
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error(`Failed to update task: ${response.status}`);
  } catch (error) {
    console.error("Ошибка при обновлении задачи:", error);
    throw error;
  }
}

async function handleTaskDrop(draggedTaskId, targetTaskId, e) {
  e.preventDefault();

  const sourceColumnId = await findColumnIdForTask(draggedTaskId);
  const targetColumnId = await findColumnIdForTask(targetTaskId);

  if (!sourceColumnId || !targetColumnId) {
    console.error(`Не удалось определить колонку для задачи: source=${sourceColumnId}, target=${targetColumnId}`);
    await loadBoard();
    return;
  }

  const draggedTaskElement = document.querySelector(`.task[data-task-id="${draggedTaskId}"]`);
  if (draggedTaskElement && sourceColumnId !== targetColumnId) {
    draggedTaskElement.style.opacity = "0"; // Плавное исчезновение
    await new Promise(resolve => setTimeout(resolve, 200)); // Ждём анимацию
  }

  try {
    const tasksResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${targetColumnId}/tasks/`);
    if (!tasksResponse.ok) throw new Error(`Failed to fetch tasks for column ${targetColumnId}`);
    const tasks = await tasksResponse.json();

    const draggedTaskResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${sourceColumnId}/tasks/${draggedTaskId}/`);
    if (!draggedTaskResponse.ok) throw new Error(`Failed to fetch task ${draggedTaskId}`);
    const draggedTaskData = await draggedTaskResponse.json();

    if (sourceColumnId !== targetColumnId) {
      const deleteResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${sourceColumnId}/tasks/${draggedTaskId}/`, {
        method: "DELETE",
      });
      if (!deleteResponse.ok) throw new Error(`Failed to delete task ${draggedTaskId} from column ${sourceColumnId}`);

      const newTaskResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${targetColumnId}/tasks/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draggedTaskData, order: tasks.length }),
      });
      if (!newTaskResponse.ok) throw new Error(`Failed to add task to column ${targetColumnId}`);

      if (draggedTaskElement) draggedTaskElement.remove();
      await updateColumn(sourceColumnId);
      await updateColumn(targetColumnId);
      console.log(`Задача ${draggedTaskId} перемещена из колонки ${sourceColumnId} в ${targetColumnId}`);
    } else {
      const targetIndex = tasks.findIndex(t => t.id === targetTaskId);
      const updatedTasks = tasks.filter(t => t.id !== draggedTaskId);
      updatedTasks.splice(targetIndex, 0, draggedTaskData);

      await Promise.all(updatedTasks.map((task, index) =>
        fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${targetColumnId}/tasks/${task.id}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: index }),
        })
      ));
      await updateColumn(targetColumnId);
      console.log(`Задача ${draggedTaskId} перемещена внутри колонки ${targetColumnId}`);
    }
  } catch (error) {
    console.error("Ошибка при изменении порядка задач:", error);
    if (draggedTaskElement) draggedTaskElement.style.opacity = "1"; // Восстанавливаем при ошибке
    await loadBoard();
  }
}

function toggleColumnContextMenu(event, columnId) {
  event.preventDefault();
  event.stopPropagation();
  const contextMenu = document.getElementById(`column-context-menu-${columnId}`);
  if (!contextMenu) return;
  const moreBtn = event.target;
  const isActive = contextMenu.classList.contains("active");

  document.querySelectorAll(".context-menu.active").forEach(menu => {
    menu.classList.remove("active");
  });

  if (!isActive) {
    contextMenu.classList.add("active");
    contextMenu.moreBtn = moreBtn;

    const rect = moreBtn.getBoundingClientRect();
    const menuHeight = contextMenu.offsetHeight;
    const menuWidth = contextMenu.offsetWidth;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    let top = rect.bottom + window.scrollY;
    let left = rect.right + window.scrollX - menuWidth;

    if (top + menuHeight > windowHeight + window.scrollY) {
      top = rect.top + window.scrollY - menuHeight;
    }

    if (left + menuWidth > windowWidth + window.scrollX) {
      left = rect.left + window.scrollX;
    }

    contextMenu.style.top = `${top}px`;
    contextMenu.style.left = `${left}px`;
    contextMenu.style.right = "auto";
  }
}

async function deleteColumn(columnId) {
  try {
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to delete column: ${response.status}`);
    console.log(`Колонка ${columnId} удалена`);
    await loadBoard();
  } catch (error) {
    console.error("Ошибка при удалении колонки:", error);
  }
}

function toggleTaskContextMenu(event, taskId) {
  event.preventDefault();
  event.stopPropagation();
  console.log(`Попытка открыть контекстное меню для задачи ${taskId}`);
  const contextMenu = document.getElementById(`task-context-menu-${taskId}`);
  if (!contextMenu) {
    console.error(`Контекстное меню для задачи ${taskId} не найдено`);
    return;
  }
  const moreBtn = event.target;
  const isActive = contextMenu.classList.contains("active");
  console.log(`Текущее состояние: isActive=${isActive}, activeContextMenu=${activeContextMenu ? activeContextMenu.id : "null"}`);

  // Закрываем предыдущее меню, если оно открыто
  if (activeContextMenu && activeContextMenu !== contextMenu) {
    activeContextMenu.classList.remove("active");
    console.log(`Закрыто предыдущее меню: ${activeContextMenu.id}`);
  }

  // Переключаем состояние текущего меню
  if (!isActive) {
    contextMenu.classList.add("active");
    contextMenu.moreBtn = moreBtn;
    activeContextMenu = contextMenu;

    const rect = moreBtn.getBoundingClientRect();
    const menuHeight = contextMenu.offsetHeight || 100; // Значение по умолчанию, если меню ещё не видно
    const menuWidth = contextMenu.offsetWidth || 150;
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    let top = rect.bottom + window.scrollY;
    let left = rect.right + window.scrollX - menuWidth;

    if (top + menuHeight > windowHeight + window.scrollY) {
      top = rect.top + window.scrollY - menuHeight;
    }
    if (left + menuWidth > windowWidth + window.scrollX) {
      left = rect.left + window.scrollX;
    }

    contextMenu.style.top = `${top}px`;
    contextMenu.style.left = `${left}px`;
    contextMenu.style.right = "auto";
    console.log(`Контекстное меню для задачи ${taskId} открыто на top=${top}, left=${left}`);
  } else {
    contextMenu.classList.remove("active");
    activeContextMenu = null;
    console.log(`Контекстное меню для задачи ${taskId} закрыто`);
  }
}

function attachTaskEventListeners(taskElement, taskId) {
  const moreBtn = taskElement.querySelector(".more-btn");
  if (!moreBtn) {
    console.error(`Кнопка more-btn не найдена в задаче ${taskId}`);
    return;
  }

  // Удаляем старый обработчик, если он есть
  if (moreBtn._clickHandler) {
    moreBtn.removeEventListener("click", moreBtn._clickHandler);
  }

  // Определяем новый обработчик
  moreBtn._clickHandler = (e) => {
    console.log(`Клик по more-btn задачи ${taskId}`);
    toggleTaskContextMenu(e, taskId);
  };
  moreBtn.addEventListener("click", moreBtn._clickHandler);

  const checkbox = taskElement.querySelector(".task-checkbox");
  checkbox.addEventListener("change", () => toggleTaskCompletion(taskId, checkbox.checked));

  taskElement.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    taskElement.classList.add("dragging");
    e.dataTransfer.setData("task-id", taskId);
    const dragGhost = taskElement.cloneNode(true);
    dragGhost.style.position = "absolute";
    dragGhost.style.top = "-1000px";
    document.body.appendChild(dragGhost);
    e.dataTransfer.setDragImage(dragGhost, 0, 0);
    setTimeout(() => document.body.removeChild(dragGhost), 0);
  });

  taskElement.addEventListener("dragend", (e) => {
    e.stopPropagation();
    taskElement.classList.remove("dragging");
  });

  taskElement.addEventListener("dragover", (e) => e.preventDefault());

  taskElement.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedTaskId = parseInt(e.dataTransfer.getData("task-id"));
    if (draggedTaskId) handleTaskDrop(draggedTaskId, taskId, e);
  });

  const contextMenuButtons = taskElement.querySelectorAll(".context-menu button");
  contextMenuButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      const action = e.target.getAttribute("data-action");
      const taskIdFromButton = parseInt(e.target.getAttribute("data-id"));
      console.log(`Клик по действию ${action} для задачи ${taskIdFromButton}`);
      switch (action) {
        case "edit":
          editTaskDescription(taskElement, taskIdFromButton);
          break;
        case "rename":
          renameTask(taskIdFromButton);
          break;
        case "delete":
          deleteTask(taskIdFromButton);
          break;
        case "edit-due-date":
          editTaskDueDate(taskIdFromButton);
          break;
      }
    });
  });
}

async function handleColumnDrop(draggedColumnId, targetColumnId) {
  if (draggedColumnId === targetColumnId) {
    console.log("Колонка осталась на месте");
    return;
  }

  const board = document.getElementById("kanbanBoard");
  const allColumns = Array.from(board.querySelectorAll(".column"));
  const draggedColumn = allColumns.find(col => parseInt(col.getAttribute("data-column-id")) === draggedColumnId);
  const targetColumn = allColumns.find(col => parseInt(col.getAttribute("data-column-id")) === targetColumnId);

  if (!draggedColumn || !targetColumn) {
    console.log("Не найдена одна из колонок:", { draggedColumnId, targetColumnId });
    return;
  }

  const draggedIndex = allColumns.indexOf(draggedColumn);
  const targetIndex = allColumns.indexOf(targetColumn);

  if (draggedIndex < targetIndex) {
    targetColumn.after(draggedColumn);
  } else {
    targetColumn.before(draggedColumn);
  }

  try {
    const updatedColumns = Array.from(board.querySelectorAll(".column")).map((col, index) => ({
      id: parseInt(col.getAttribute("data-column-id")),
      order: index,
    }));

    await Promise.all(updatedColumns.map(col =>
      fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${col.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: col.order }),
      })
    ));

    console.log("Порядок колонок обновлён:", updatedColumns);
  } catch (error) {
    console.error("Ошибка при изменении порядка колонок:", error);
    await loadBoard();
  }
}

async function handleColumnTaskDrop(draggedTaskId, targetColumnId) {
  const sourceColumnId = await findColumnIdForTask(draggedTaskId);
  if (sourceColumnId === targetColumnId) {
    console.log("Задача осталась в той же колонке");
    return;
  }

  const draggedTaskElement = document.querySelector(`.task[data-task-id="${draggedTaskId}"]`);
  if (draggedTaskElement) {
    // Анимация исчезновения из исходной колонки
    draggedTaskElement.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    draggedTaskElement.style.opacity = "0";
    draggedTaskElement.style.transform = "translateY(20px)";
    await new Promise(resolve => setTimeout(resolve, 300)); // Ждём анимацию
  }

  try {
    // Получаем данные задачи из исходной колонки
    const taskResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${sourceColumnId}/tasks/${draggedTaskId}/`);
    if (!taskResponse.ok) throw new Error(`Failed to fetch task ${draggedTaskId}`);
    const task = await taskResponse.json();

    // Удаляем задачу из исходной колонки
    const deleteResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${sourceColumnId}/tasks/${draggedTaskId}/`, {
      method: "DELETE",
    });
    if (!deleteResponse.ok) throw new Error(`Failed to delete task ${draggedTaskId} from column ${sourceColumnId}`);

    // Получаем текущие задачи в целевой колонке для определения порядка
    const targetTasksResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${targetColumnId}/tasks/`);
    if (!targetTasksResponse.ok) throw new Error(`Failed to fetch tasks for column ${targetColumnId}`);
    const targetTasks = await targetTasksResponse.json();

    // Добавляем задачу в целевую колонку
    const postResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${targetColumnId}/tasks/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...task, order: targetTasks.length }),
    });
    if (!postResponse.ok) throw new Error(`Failed to add task to column ${targetColumnId}`);

    // Удаляем элемент из DOM после успешного запроса
    if (draggedTaskElement) draggedTaskElement.remove();

    // Обновляем обе колонки с анимацией появления новой задачи
    await updateColumn(sourceColumnId);
    await updateColumn(targetColumnId);

    // Добавляем анимацию появления новой задачи
    const newTaskElement = document.querySelector(`.task[data-task-id="${draggedTaskId}"]`);
    if (newTaskElement) {
      newTaskElement.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      newTaskElement.style.opacity = "0";
      newTaskElement.style.transform = "translateY(-20px)";
      setTimeout(() => {
        newTaskElement.style.opacity = "1";
        newTaskElement.style.transform = "translateY(0)";
      }, 10); // Небольшая задержка для запуска анимации
    }

    console.log(`Задача ${draggedTaskId} перемещена из колонки ${sourceColumnId} в ${targetColumnId}`);
  } catch (error) {
    console.error("Ошибка при переносе задачи:", error);
    if (draggedTaskElement) {
      // Восстанавливаем задачу при ошибке
      draggedTaskElement.style.opacity = "1";
      draggedTaskElement.style.transform = "translateY(0)";
    }
    await loadBoard();
  }
}


async function toggleTaskCompletion(taskId, completed) {
  try {
    const columnId = await findColumnIdForTask(taskId);
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    });
    if (!response.ok) throw new Error(`Failed to update task: ${response.status}`);
    console.log(`Статус задачи ${taskId} обновлён: ${completed}`);
    await updateColumn(columnId);
  } catch (error) {
    console.error("Ошибка при обновлении статуса задачи:", error);
    await loadBoard();
  }
}


// Вспомогательная функция для поиска columnId по taskId
async function findColumnIdForTask(taskId) {
  try {
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/`);
    if (!response.ok) throw new Error(`Failed to fetch columns: ${response.status}`);
    const columns = await response.json();
    console.log(`Колонки для команды ${currentTeamId}:`, columns);

    for (const column of columns) {
      const tasksResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${column.id}/tasks/`);
      if (!tasksResponse.ok) {
        console.warn(`Не удалось загрузить задачи для колонки ${column.id}: ${tasksResponse.status}`);
        continue;
      }
      const tasks = await tasksResponse.json();
      console.log(`Задачи в колонке ${column.id}:`, tasks);
      const foundTask = tasks.find(task => task.id === taskId);
      if (foundTask) {
        console.log(`Задача ${taskId} найдена в колонке ${column.id}`);
        return column.id;
      }
    }
    console.error(`Колонка для задачи ${taskId} не найдена`);
    return null;
  } catch (error) {
    console.error("Ошибка в findColumnIdForTask:", error);
    return null;
  }
}


async function deleteTask(taskId) {
  try {
    const columnId = await findColumnIdForTask(taskId);
    const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to delete task: ${response.status}`);
    console.log(`Задача ${taskId} удалена`);

    const taskElement = document.querySelector(`.task[data-task-id="${taskId}"]`);
    const taskList = taskElement?.parentElement;
    if (taskElement && taskList) {
      // Скрываем ползунок во время анимации
      taskList.style.overflowY = "hidden";
      taskElement.style.transition = "opacity 0.3s ease, transform 0.3s ease, height 0.3s ease";
      taskElement.style.opacity = "0";
      taskElement.style.transform = "scale(0.95)";
      taskElement.style.height = `${taskElement.offsetHeight}px`; // Фиксируем текущую высоту
      setTimeout(() => {
        taskElement.style.height = "0"; // Уменьшаем высоту до 0
        taskElement.style.marginBottom = "0"; // Убираем отступ
      }, 10);
      await new Promise(resolve => setTimeout(resolve, 300)); // Ждём анимацию
      taskElement.remove(); // Удаляем элемент
      taskList.style.overflowY = "auto"; // Восстанавливаем ползунок
    }

    await updateColumn(columnId);
  } catch (error) {
    console.error("Ошибка при удалении задачи:", error);
    alert("Не удалось удалить задачу. Попробуйте снова.");
  }
}

async function editTaskDescription(taskElement, taskId) {
  document.querySelectorAll(".context-menu.active").forEach(menu => menu.classList.remove("active"));

  const columnId = await findColumnIdForTask(taskId);
  const descriptionDiv = taskElement.querySelector(".description");
  const currentDescription = descriptionDiv.textContent || "";

  const textarea = document.createElement("textarea");
  textarea.classList.add("task-description-input");
  textarea.placeholder = "Введите описание...";
  textarea.value = currentDescription;
  descriptionDiv.innerHTML = "";
  descriptionDiv.appendChild(textarea);
  descriptionDiv.classList.add("visible");
  textarea.focus();

  textarea.addEventListener("blur", async () => {
    const newDescription = textarea.value.trim();
    if (newDescription !== currentDescription) {
      try {
        const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: newDescription }),
        });
        if (!response.ok) throw new Error(`Failed to update description: ${response.status}`);
        await updateColumn(columnId); // Обновляем только колонку
      } catch (error) {
        console.error("Ошибка при обновлении описания:", error);
        await loadBoard();
      }
    } else {
      await updateColumn(columnId);
    }
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    } else if (e.key === "Escape") {
      updateColumn(columnId);
    }
  });
}

async function renameTask(taskId) {
  const taskElement = document.querySelector(`.task[data-task-id="${taskId}"]`);
  const taskNameSpan = taskElement.querySelector(".task-name");
  const currentName = taskNameSpan.textContent;

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentName;
  input.classList.add("new-task-input");
  taskNameSpan.innerHTML = "";
  taskNameSpan.appendChild(input);
  input.focus();

  input.addEventListener("blur", async () => {
    const newName = input.value.trim();
    if (newName && newName !== currentName) {
      try {
        const columnId = await findColumnIdForTask(taskId);
        const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        if (!response.ok) throw new Error(`Failed to rename task: ${response.status}`);
        await loadBoard();
      } catch (error) {
        console.error("Ошибка при переименовании задачи:", error);
        await loadBoard();
      }
    } else {
      await loadBoard();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
  });
}

async function editTaskDueDate(taskId) {
  const taskElement = document.querySelector(`.task[data-task-id="${taskId}"]`);
  const dueDateDiv = taskElement.querySelector(".due-date") || document.createElement("div");
  if (!taskElement.contains(dueDateDiv)) {
    dueDateDiv.classList.add("due-date");
    taskElement.insertBefore(dueDateDiv, taskElement.querySelector(".context-menu"));
  }

  const columnId = await findColumnIdForTask(taskId);
  const taskResponse = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`);
  const task = await taskResponse.json();
  const currentDueDate = task.due_date || "";

  const input = document.createElement("input");
  input.type = "date";
  input.value = currentDueDate ? currentDueDate.slice(0, 10) : "";
  input.style.width = "100%";
  dueDateDiv.innerHTML = "";
  dueDateDiv.appendChild(input);
  input.focus();

  input.addEventListener("blur", async () => {
    const newDueDate = input.value ? `${input.value}T00:00:00` : null;
    if (newDueDate !== currentDueDate) {
      try {
        const response = await fetch(`${API_BASE_URL}teams/${currentTeamId}/columns/${columnId}/tasks/${taskId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ due_date: newDueDate }),
        });
        if (!response.ok) throw new Error(`Failed to update due date: ${response.status}`);
        await updateColumn(columnId);
      } catch (error) {
        console.error("Ошибка при обновлении дедлайна:", error);
        await loadBoard();
      }
    } else {
      await updateColumn(columnId);
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") updateColumn(columnId);
  });
}

async function renderBoard() {
  document.getElementById("kanbanBoard").innerHTML = "";
  await loadBoard();
}