# @fast-link/react

## 0.0.3

Document installation, the complete hook contract, controller lifecycle, and
the package's role in custom React adapters. Runtime behavior is unchanged.

## 0.0.2

Update the core dependency to 0.0.2 so bound controllers share anchor ownership
with the Next adapter.

Move the hook and its tests into a dedicated folder and keep the package entry
point limited to named exports. Public imports and behavior are unchanged.

## 0.0.1

Add `useFastLink` to bind a core controller to a React-owned DOM element.
