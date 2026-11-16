import { Command } from "commander";

export function createCli() {
  const program = new Command()
    .name("ray-cli")
    .description("Learn the Claude Agent SDK through a Cursor-like CLI")
    .version("0.1.0");

  program
    .command("hello")
    .description("Print a greeting")
    .action(() => {
      console.log("Hello Rayyan");
    });


  program
    .command("goodbye")
    .description("prints a goodbye username")
    .action(() => {
      console.log("goodbye Rayyan")
    })

  program.action(() => {
    program.help();
  });

  return program;
}
