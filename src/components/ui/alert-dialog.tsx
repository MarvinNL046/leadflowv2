import * as React from "react";
import { AlertDialog as Primitive } from "radix-ui";
import { cn } from "#/lib/utils";

const AlertDialog = Primitive.Root;
const AlertDialogTrigger = Primitive.Trigger;
const AlertDialogCancel = Primitive.Cancel;
const AlertDialogAction = Primitive.Action;
function AlertDialogContent({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Content>) {
	return (
		<Primitive.Portal>
			<Primitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
			<Primitive.Content
				className={cn(
					"fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-card p-6 text-card-foreground shadow-lg",
					className,
				)}
				{...props}
			/>
		</Primitive.Portal>
	);
}
function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Title>) {
	return (
		<Primitive.Title
			className={cn("text-lg font-semibold", className)}
			{...props}
		/>
	);
}
function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof Primitive.Description>) {
	return (
		<Primitive.Description
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}
export {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogCancel,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogDescription,
};
