/**
 * @license
 * Copyright Akveo. All Rights Reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import { Inject, Injectable } from '@angular/core';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { NgdTabbedService } from './tabbed.service';
import { NgdMdSection, NgdTextService } from './text.service';
import { DOCS, STRUCTURE } from '../../app.options';
import { NgdArticleService } from './article.service';

type NgdToc = { title: string, fragment: string }[];

@Injectable()
export class NgdStructureService {

  protected prepared;

  constructor(private textService: NgdTextService,
              private tabbedService: NgdTabbedService,
              private articleService: NgdArticleService,
              @Inject(STRUCTURE) structure,
              @Inject(DOCS) docs) {
    this.prepared = this.prepareStructure(structure, docs);
  }

  getPreparedStructure(): any {
    return this.prepared;
  }

  findPageBySlag(structure: any, slag: string): any {
    for (const item of structure) {
      if (item.slag === slag) {
        return item;
      }
      if (item.type === 'section' && item.children) {
        const deep = this.findPageBySlag(item.children, slag);
        if (deep) {
          return deep;
        }
      }
    }
  }

  protected prepareStructure(structure: any, preparedDocs: any, parentSlag?: string): any {
    return structure.map((item: any) => {
      const slag = item.name ? this.textService.createSlag(item.name) : null;

      if (item.type === 'block' && typeof item.source === 'string') {

        if (item.block === 'theme') {
          item.source = preparedDocs.themes[item.source];
        }

        if (item.block === 'component') {
          item.source = this.prepareComponent(preparedDocs.classes.find((data) => data.name === item.source));
        }
      }

      if (item.block === 'markdown') {
        item.sections = this.articleService.getArticle(item.source).pipe(
          map((article) => this.textService.mdToSectionsHTML(article)),
        );
      }

      if (item.children) {
        item.children = this.prepareStructure(item.children, preparedDocs, slag);
      }

      if (item.type === 'tabs') {
        item.source = this.getComponents(item, preparedDocs);
        item.tabs = this.tabbedService.determineTabs(item);

        // we emulate a block here
        item.children = [
          {
            type: 'block',
            block: 'tabbed',
            children: item.source,
          },
        ];
      }

      if (item.type === 'page' || item.type === 'tabs') {
        item.toc = this.prepareToc(item);
        item.slag = parentSlag ? `${parentSlag}_${slag}` : slag;
      }

      return item;
    });
  }

  protected getComponents(item: any, preparedDocs) {
    return item.source
      .map(source => preparedDocs.classes.find((data) => data.name === source))
      .map(component => this.prepareComponent(component));
  }

  protected prepareComponent(component: any) {
    if (!component.isPrepared) {
      const textNodes = component.overview.filter(node => node.type === 'text');
      if (textNodes && textNodes.length) {
        textNodes[0].content = `## ${component.name}\n\n${textNodes[0].content}`; // TODO: this is bad
      }
      // Set isPrepared property to skip repeatin sources in structure.ts
      component.isPrepared = true;
    }
    return {
      ... component,
      slag: this.textService.createSlag(component.name),
      overview: component.overview.map((node: any) => {
        if (node.type === 'text') {
          return {
            type: node.type,
            content: this.textService.mdToSectionsHTML(node.content),
          };
        }
        return node;
      }),
    };
  }

  protected prepareToc(item: any): Observable<NgdToc[]> {
    const tocList: Observable<NgdToc>[] = item.children
      .reduce((acc: Observable<NgdToc>[], child: any) => {
        if (child.block === 'markdown') {
          acc.push(this.getTocForMd(child));
        } else if (child.block === 'tabbed') {
          acc.push(this.getTocForTabbed(child));
        } else if (child.block === 'component') {
          acc.push(this.getTocForComponent(child));
        }
        return acc;
      }, []);

    return combineLatest(tocList).pipe(
      map((toc) => [].concat(...toc)),
    );
  }

  protected getTocForMd(block: { sections: Observable<NgdMdSection[]> }): Observable<NgdToc> {
    return block.sections
      .pipe(
        map((sections) => {
          return sections
            .map(({ title, fragment }) => ({ title, fragment }));
        }),
      );
  }

  protected getTocForComponent(block: any): Observable<NgdToc> {
    return of([{
      title: block.source.name,
      fragment: block.source.slag,
    }]);
  }

  protected getTocForTabbed(block: any): Observable<NgdToc> {
    return of(block.children.map((component: any) => ({
      title: component.name,
      fragment: this.textService.createSlag(component.name),
    })));
  }
}
