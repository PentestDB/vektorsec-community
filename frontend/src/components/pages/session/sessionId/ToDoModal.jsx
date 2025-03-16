import ModalComponent from "@/components/common/ModalComponent";
import { Button, Form, Input, Select, Spin, message } from "antd";
import {
  getSessionTodoList,
  updateSessionTodoList,
} from "@/services/copilot.service";
import { useMutation, useQuery, useQueryClient } from "react-query";
import styles from "@/styles/pages/Session.module.scss";
import { BsArrowReturnRight } from "react-icons/bs";
import { useState } from "react";
import Image from "next/image";
import emptyBox from "@/assets/empty-box.svg";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import {
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import PrimaryButton from "@/components/common/PrimaryButton";

const ToDoModal = ({ session_id, show, setShow }) => {
  const queryClient = useQueryClient();
  const [todoList, setTodoList] = useState([]);
  const [openForm, setOpenForm] = useState(false);
  const [todoType, setTodoType] = useState("");
  const [selectedTodoIdx, setSelectedTodoIdx] = useState(null);

  const { isLoading } = useQuery(
    ["get-session-todo-list"],
    () => getSessionTodoList({ session_id }),
    {
      enabled: !!session_id && show,
      onSuccess: (data) => {
        setTodoList(data);
        const finalTodo = [];

        data.forEach((todo) => {
          finalTodo.push({
            ...todo,
            type: "main",
            edit: false,
          });

          todo.substeps?.forEach((substep) => {
            finalTodo.push({
              ...substep,
              type: "sub",
              edit: false,
            });
          });
        });

        setTodoList(finalTodo);
      },

      onError: (error) => {
        console.error(error);
        setTodoList([]);
      },
    }
  );

  const updateTodoMutation = useMutation(updateSessionTodoList, {
    onSuccess: () => {
      message.success("Todo list updated successfully");
      queryClient.invalidateQueries(["get-session-todo-list"]);
    },
    onError: (error) => {
      console.error(error);
      message.error("Failed to update todo list!");
    },
  });

  const renderStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "#4caf50";
      case "pending":
        return "#ff9800";
      case "in-progress":
        return "#2196f3";
      default:
        return "#f44336";
    }
  };

  const onDragEnd = (result) => {
    if (!result.destination) {
      return;
    }

    const reorderedTodoList = Array.from(todoList);
    const [reorderedItem] = reorderedTodoList.splice(result.source.index, 1);
    reorderedTodoList.splice(result.destination.index, 0, reorderedItem);

    if (reorderedTodoList[0].type !== "main") {
      return;
    }

    setTodoList(reorderedTodoList);
  };

  const addSubTodo = ({ todoType, index }) => {
    setOpenForm(true);
    setTodoType(todoType);
    setSelectedTodoIdx(index);
  };

  const addMainTodo = ({ todoType, index }) => {
    setOpenForm(true);
    setTodoType(todoType);
    setSelectedTodoIdx(index);
  };

  const onSubmitNewTodo = (values) => {
    const listItem = { ...values, type: todoType };
    const newTodo = [listItem];

    if (newTodo.length !== 0) {
      // add this newTodo to the todoList but at the selectedTodoIdx based on the todoType
      const updatedTodoList = [...todoList];
      updatedTodoList.splice(selectedTodoIdx + 1, 0, ...newTodo);
      setTodoList(updatedTodoList);

      setOpenForm(false);
    }
  };

  const formatTodoList = (list) => {
    if (!list || list.length === 0) {
      console.log("Invalid todo list");
      return [];
    }

    let currentMainItem = null;

    const formattedList = list
      .map((item) => {
        const { type, edit, ...rest } = item;
        if (item.type === "main") {
          currentMainItem = { ...rest, substeps: [] };
          return currentMainItem;
        } else if (currentMainItem) {
          currentMainItem.substeps.push({ ...rest });
        }
        return null; // or return undefined; if you want to skip this item
      })
      .filter(Boolean);

    return formattedList;
  };

  const updateTodoList = async () => {
    const formattedTodoList = formatTodoList(todoList);

    const data = {
      session_id,
      todoList: formattedTodoList,
    };

    await updateTodoMutation.mutateAsync(data);
  };

  const editTodo = (index) => {
    const updatedTodoList = [...todoList];
    updatedTodoList[index].edit = true;
    setTodoList(updatedTodoList);
  };

  const removeEdit = (index) => {
    const updatedTodoList = [...todoList];
    updatedTodoList[index].edit = false;
    setTodoList(updatedTodoList);
  };

  const editTodoForm = (values, index) => {
    console.log(values);
    const { todoTitle, todoStatus } = values;

    const updatedTodoList = [...todoList];
    updatedTodoList[index].title = todoTitle;
    updatedTodoList[index].status = todoStatus;
    updatedTodoList[index].edit = false;
    setTodoList(updatedTodoList);
  };

  const deleteTodoItem = (index) => {
    const task = todoList[index];
    const isLastItem = index === todoList.length - 1;
    const nextTask = isLastItem ? null : todoList[index + 1];

    const stopDelete =
      task.type === "main" && !isLastItem && nextTask.type === "sub";

    if (stopDelete) {
      message.error("Delete the subtasks first");
      return;
    }

    const updatedTodoList = [...todoList];
    updatedTodoList.splice(index, 1);
    setTodoList(updatedTodoList);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <ModalComponent
        show={show}
        destroyOnClose
        setShow={setShow}
        heading="Copilot Checklist"
        subheading="Pentest Copillot creates and follows a comprehensive pentest checklist based on the current assessments and previous command outputs."
      >
        {isLoading ? (
          <div
            style={{
              display: "flex",
              padding: "2rem 0",
              justifyContent: "center",
            }}
          >
            <Spin />
          </div>
        ) : todoList?.length > 0 ? (
          <>
            <div className={styles.todoHeader}>
              <p>Task</p>
              <p>Status</p>
            </div>
            <Droppable droppableId="todoList">
              {(provided) => (
                <div
                  className={styles.todoWrapper}
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                >
                  {todoList?.map((todo, index) => (
                    <Draggable
                      key={index}
                      index={index}
                      draggableId={`todo-${index}`}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={styles.todoProcess}
                        >
                          <div
                            className={styles.stepTitle}
                            style={{
                              marginLeft: todo.type === "sub" ? "1rem" : "0",
                            }}
                          >
                            {todo.type === "sub" && <BsArrowReturnRight />}
                            <h4>{todo.title}</h4>
                            {todo.type === "main" && (
                              <span
                                className={styles.addSubTodo}
                                onClick={() => {
                                  addSubTodo({ todoType: "sub", index });
                                }}
                              >
                                {" "}
                                +{" "}
                              </span>
                            )}
                          </div>
                          <div className={styles.actions}>
                            <EditOutlined
                              onClick={() => editTodo(index)}
                              className={styles.editBtn}
                            />
                            <DeleteOutlined
                              onClick={() => deleteTodoItem(index)}
                              className={styles.deleteBtn}
                            />
                            <div
                              className={styles.statusTag}
                              style={{
                                backgroundColor: renderStatusColor(todo.status),
                              }}
                            >
                              {todo.status}
                            </div>
                          </div>
                          {todo.edit && (
                            <div className={styles.todoForm}>
                              <Form
                                initialValues={{
                                  todoTitle: todo.title,
                                  todoStatus: todo.status,
                                }}
                                onFinish={(v) => editTodoForm(v, index)}
                              >
                                <Form.Item
                                  name={"todoTitle"}
                                  rules={[
                                    {
                                      required: true,
                                      message: "Please enter task title",
                                    },
                                    {
                                      max: 20,
                                      message: "Task title is too long",
                                    },
                                  ]}
                                >
                                  <Input placeholder="Enter task title" />
                                </Form.Item>

                                <Form.Item
                                  name="todoStatus"
                                  rules={[
                                    {
                                      required: true,
                                      message: "Please select task status",
                                    },
                                  ]}
                                >
                                  <Select placeholder="Select task status">
                                    <Select.Option value="pending">
                                      Pending
                                    </Select.Option>
                                    <Select.Option value="in-progress">
                                      In progress
                                    </Select.Option>
                                    <Select.Option value="completed">
                                      Completed
                                    </Select.Option>
                                  </Select>
                                </Form.Item>

                                <Button
                                  htmlType="submit"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: "0",
                                  }}
                                >
                                  <CheckCircleOutlined
                                    className={styles.checkBtn}
                                  />
                                </Button>
                                <MinusCircleOutlined
                                  className={styles.closeBtn}
                                  onClick={() => removeEdit(index)}
                                />
                              </Form>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>

            <Button
              className={styles.addTodoBtn}
              onClick={() =>
                addMainTodo({ todoType: "main", index: todoList.length - 1 })
              }
            >
              Add Main Task <span className={styles.plusIcon}>+</span>
            </Button>

            {openForm && (
              <Form
                layout="vertical"
                className={styles.addTodoForm}
                onFinish={onSubmitNewTodo}
              >
                <div>
                  <Form.Item
                    label={
                      todoType === "sub" ? "Sub task title" : "Main task title"
                    }
                    name={"title"}
                    rules={[
                      {
                        required: true,
                        message: "Please enter task title",
                      },
                      {
                        max: 20,
                        message: "Task title is too long",
                      },
                    ]}
                  >
                    <Input placeholder={"Task Description comes here"} />
                  </Form.Item>
                </div>
                <div>
                  <Form.Item
                    name="status"
                    label={"Select status"}
                    rules={[
                      {
                        required: true,
                        message: "Please select task status",
                      },
                    ]}
                  >
                    <Select placeholder="Select task status">
                      <Select.Option value="pending">Pending</Select.Option>
                      <Select.Option value="in-progress">
                        In progress
                      </Select.Option>
                      <Select.Option value="completed">Completed</Select.Option>
                    </Select>
                  </Form.Item>
                </div>

                <div className={styles.selectAction}>
                  <Button htmlType="submit">
                    <CheckCircleOutlined />
                  </Button>
                  <MinusCircleOutlined onClick={() => setOpenForm(false)} />
                </div>
              </Form>
            )}
            <div
              style={{
                display: "flex",
                marginTop: "1rem",
                justifyContent: "flex-end",
              }}
            >
              <PrimaryButton
                limegreen
                onClick={updateTodoList}
                loading={updateTodoMutation.isLoading}
              >
                Save
              </PrimaryButton>
            </div>
          </>
        ) : (
          <div className={styles.todoPlaceholder}>
            <Image
              src={emptyBox}
              alt=""
              width={110}
              height={110}
              className={styles.placeImage}
            />
            <h3>No tasks found in this session</h3>
          </div>
        )}
      </ModalComponent>
    </DragDropContext>
  );
};

export default ToDoModal;
