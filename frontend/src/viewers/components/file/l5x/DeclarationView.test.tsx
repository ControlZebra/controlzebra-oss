import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { parseString, type AOILocalTag, type NormalizedArrayTagValue } from 'ladder-visualizer';
import DeclarationView from './DeclarationView';
import ControllerCollections from './ControllerCollections';

function fixture(name: string) {
  const source = readFileSync(resolve('src/viewers/components/shared/__fixtures__/l5x', `${name}.L5X`), 'utf8');
  const result = parseString(source, 'l5x');
  if (!result.data) throw new Error(`No controller in ${name}`);
  return result.data;
}
function open(name: string | RegExp, scope: ReturnType<typeof within> = screen) {
  const button = scope.getByRole('button', { name });
  fireEvent.click(button);
  return within(button.parentElement!);
}

describe('L5X declaration details', () => {
  it('shows exact program local identity, declared order, comments, source defaults and type links', () => {
    const controller = fixture('program-local-tags-v35');
    const onOpen = vi.fn();
    render(<DeclarationView declarations={controller.programs[0].localTags}
      catalog={controller.dataTypeCatalog ?? controller.dataTypes} onOpen={onOpen} />);
    expect(screen.getAllByRole('button').map(button => button.textContent?.trim())).toEqual(['1. Hidden DINT', '2. Buffer DINT']);
    open(/1\. Hidden/);
    expect(screen.getByRole('row', { name: 'UID 18446744073709551615' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Parent UID 4' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Data type UID 5' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Program ProgramLocals' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'External access ReadOnly' })).toBeVisible();
    open('Open Data type: DINT');
    expect(onOpen).toHaveBeenCalledWith({ type: 'data-type', dataTypeName: 'DINT' }, 'DINT');
    open(/Operand: Empty string/);
    expect(screen.getByRole('button', { name: /Initial value/ })).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Default representations' })).getAllByRole('button').map(button => button.textContent))
      .toEqual(['1. L5K', '2. Decorated']);
    open('1. L5K');
    expect(screen.getByRole('region', { name: 'Source default text' })).toHaveTextContent('7');
    open('2. Decorated');
    open('1. DINT = 7');
    expect(screen.getByRole('row', { name: 'Value 7' })).toBeVisible();
  });

  it('shows optional flags and multidimensional defaults on program parameters', () => {
    const controller = fixture('program-parameters-v35');
    render(<DeclarationView declarations={controller.programs[0].parameters} catalog={[]} onOpen={vi.fn()} />);
    open(/1\. Recipe/);
    expect(screen.getByRole('row', { name: 'Constant false' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Dimensions [2][3]' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Usage InOut' })).toBeVisible();
    open('1. Decorated');
    open('1. DINT');
    expect(screen.getByRole('button', { name: '1. [0,0] = 7' })).toBeVisible();
    expect(screen.getByRole('button', { name: '2. [1,2] = 9' })).toBeVisible();
    open(/2\. Scratch/);
    expect(screen.getByRole('row', { name: 'Constant Not supplied' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Default value Not supplied' })).toBeVisible();
  });

  it('shows AOI Constant metadata and ordered operand comments from a v34 export', () => {
    const controller = fixture('aoi-interface-metadata-v34');
    const aoi = controller.aois[0];
    render(<DeclarationView declarations={aoi.parameters} catalog={[]} onOpen={vi.fn()} />);
    const constant = aoi.parameters.findIndex(parameter => parameter.constant !== undefined);
    open(new RegExp(`${constant + 1}\\. ${aoi.parameters[constant].name}`));
    expect(screen.getByRole('row', { name: `Constant ${aoi.parameters[constant].constant}` })).toBeVisible();
    const comments = aoi.parameters.findIndex(parameter => parameter.comments?.length);
    if (comments !== constant) open(new RegExp(`${comments + 1}\\. ${aoi.parameters[comments].name}`));
    expect(screen.getByRole('region', { name: 'Operand comments' })).toHaveTextContent(aoi.parameters[comments].comments![0].operand!);
  });

  it('retains raw bytes separately from recursive decorated defaults in older exports', () => {
    const aoi = fixture('aoi-defaults-v17').aois[0];
    render(<DeclarationView declarations={aoi.localTags} catalog={[]} onOpen={vi.fn()} />);
    open(/3\. InstTracker/);
    open('1. Not supplied');
    expect(screen.getByRole('region', { name: 'Source default text' })).toHaveTextContent('00 00 00 00');
    expect(screen.queryByRole('row', { name: 'Default value 0' })).not.toBeInTheDocument();
    open('2. Decorated');
    open('1. MOTION_INSTRUCTION');
    open('1. [0]');
    fireEvent.click(within(screen.getByRole('region', { name: 'Structures' })).getByRole('button', { name: '1. MOTION_INSTRUCTION' }));
    open('1. FLAGS = 0');
    expect(screen.getByRole('row', { name: 'Value 0' })).toBeVisible();
  });

  it('distinguishes absent, empty, zero, false and empty default representations', () => {
    const base: AOILocalTag = { name: 'Value', dataType: 'BOOL', externalAccess: 'None' };
    render(<DeclarationView declarations={[
      base, { ...base, name: 'Zero', defaultValue: 0 }, { ...base, name: 'False', defaultValue: false },
      { ...base, name: 'Empty', defaultValue: '' }, { ...base, name: 'NoRepresentations', defaultData: [] },
      { ...base, name: 'EmptySource', defaultData: [{ format: 'String', length: 0, text: '', values: [] }] },
    ]} catalog={[]} onOpen={vi.fn()} />);
    const declarations = within(screen.getByRole('region', { name: 'Declarations' }));
    for (const [name, text] of [['Value', 'Not supplied'], ['Zero', '0'], ['False', 'false'], ['Empty', 'Empty string']]) {
      const details = open(new RegExp(`\\d\\. ${name} BOOL`), declarations);
      expect(details.getByRole('row', { name: `Default value ${text}` })).toBeVisible();
    }
    const noRepresentations = open(/5\. NoRepresentations/, declarations);
    expect(noRepresentations.getByRole('region', { name: 'Default representations' })).toHaveTextContent('None');
    const emptySource = open(/6\. EmptySource/, declarations);
    const source = open('1. String', within(emptySource.getByRole('region', { name: 'Default representations' })));
    expect(source.getByRole('region', { name: 'Source default text' })).toHaveTextContent('Empty string');
    expect(source.getByRole('row', { name: 'Length 0' })).toBeVisible();
  });

  it('does not access collapsed descendants and pages large declared arrays without creating missing elements', () => {
    const readElements = vi.fn(() => Array.from({ length: 123 }, (_, index) => ({ index: [index], value: String(index), structures: [] })));
    const array: NormalizedArrayTagValue = { kind: 'array', dataType: 'DINT', dimensions: [1000000000], get elements() { return readElements(); } };
    const declarations: AOILocalTag[] = [{ name: 'Large', dataType: 'DINT', externalAccess: 'None', defaultData: [{ format: 'Decorated', values: [array] }] }];
    render(<DeclarationView declarations={declarations} catalog={[]} onOpen={vi.fn()} />);
    expect(readElements).not.toHaveBeenCalled();
    const declaration = open(/1\. Large/);
    const representation = open('1. Decorated', within(declaration.getByRole('region', { name: 'Default representations' })));
    expect(readElements).not.toHaveBeenCalled();
    const arrayDetails = open('1. DINT', within(representation.getByRole('region', { name: 'Decorated values' })));
    const elements = within(arrayDetails.getByRole('region', { name: 'Array elements' }));
    expect(elements.getAllByRole('button', { expanded: false })).toHaveLength(50);
    expect(elements.queryByRole('button', { name: '51. [50] = 50' })).not.toBeInTheDocument();
    fireEvent.click(within(elements.getByRole('navigation', { name: 'Array elements pages' })).getByRole('button', { name: 'Next' }));
    expect(elements.getByRole('button', { name: '51. [50] = 50' })).toBeVisible();
    expect(elements.getByText('Page 2 of 3')).toBeVisible();
  });

  it('pages declarations and clears expanded positions when refresh reorders the collection', () => {
    const declarations = Array.from({ length: 120 }, (_, index): AOILocalTag => ({ name: `Local${index}`, dataType: 'DINT', externalAccess: 'None' }));
    const { rerender } = render(<DeclarationView declarations={declarations} catalog={[]} onOpen={vi.fn()} />);
    const collection = within(screen.getByRole('region', { name: 'Declarations' }));
    expect(collection.getAllByRole('button', { expanded: false })).toHaveLength(50);
    fireEvent.click(within(collection.getByRole('navigation', { name: 'Declarations pages' })).getByRole('button', { name: 'Next' }));
    const details = open('51. Local50 DINT', collection);
    expect(details.getByRole('row', { name: 'Name Local50' })).toBeVisible();
    rerender(<DeclarationView declarations={[...declarations].reverse()} catalog={[]} onOpen={vi.fn()} />);
    expect(collection.queryByRole('row', { name: 'Name Local50' })).not.toBeInTheDocument();
    expect(collection.getByRole('button', { name: '1. Local119 DINT' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter declarations' }), { target: { value: 'Local11' } });
    expect(collection.getAllByRole('button', { expanded: false }).map(button => button.textContent?.trim())).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `${index + 1}. Local${119 - index} DINT`), '11. Local11 DINT',
    ]);
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter declarations' }), { target: { value: 'Missing' } });
    expect(screen.getByText(/No matching declarations/)).toBeVisible();
  });
});

describe('controller collections', () => {
  it('shows complete trend metadata, ordered pens and exact source scopes', () => {
    const controller = fixture('trends-watch-lists-v33');
    const { rerender } = render(<ControllerCollections controller={controller} type="trends" onOpen={vi.fn()} />);
    open('1. ProcessTrend');
    expect(screen.getByRole('row', { name: 'UID 18446744073709551615' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Start trigger target tag 2 PermitTarget' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Post-samples 25' })).toBeVisible();
    open('1. Temperature');
    expect(screen.getByRole('row', { name: 'Engineering units degC' })).toBeVisible();
    expect(screen.getByRole('row', { name: 'Minimum -1.5' })).toBeVisible();
    rerender(<ControllerCollections controller={controller} type="watch-lists" onOpen={vi.fn()} />);
    open('1. Operators');
    open('1. Temperature');
    expect(screen.getByRole('row', { name: 'Source scope MainProgram' })).toBeVisible();
  });

  it('shows missing trend fields and empty pen/watch collections without inventing values', () => {
    const controller = fixture('trends-watch-lists-v35');
    const { rerender } = render(<ControllerCollections controller={controller} type="trends" onOpen={vi.fn()} />);
    open('1. Minimal');
    expect(screen.getByRole('row', { name: 'Sample period Not supplied' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Pens' })).toHaveTextContent('None');
    rerender(<ControllerCollections controller={controller} type="watch-lists" onOpen={vi.fn()} />);
    open('1. Empty');
    expect(screen.getByRole('region', { name: 'Watch tags' })).toHaveTextContent('None');
  });
});
