"""What the open Studio window is working on, shared by every tab."""
from typing import Dict, List, Optional

from PySide6.QtCore import QObject, Signal

from . import factory, native
from .model import Persona, Project, encode_pack


class Session(QObject):
    projectChanged = Signal()   # faces or animations added, removed, renamed or replaced
    edited = Signal()           # any change at all (including values inside a face or key)
    personaChanged = Signal()   # the persona on the Personality tab changed
    manifestChanged = Signal()  # factory manifest generated, opened or updated

    def __init__(self):
        super().__init__()
        self.project = Project()
        self.path: Optional[str] = None
        self.dirty = False
        self.persona = Persona(name=native.name_from_seed(1), genes=native.genes_from_seed(1))
        self.manifest_path: Optional[str] = None
        self.manifest_rows: List[Dict[str, str]] = []

    # ---- project ----
    def touch(self, structural=True):
        """Marks the project changed. Pass structural=False for edits that don't need tabs to rebuild."""
        self.dirty = True
        if structural:
            self.projectChanged.emit()
        self.edited.emit()

    def replace_project(self, project, path=None):
        self.project = project
        self.path = path
        self.dirty = False
        self.projectChanged.emit()
        self.edited.emit()

    def pack(self, persona: Optional[Persona] = None, include_emotions=True) -> bytes:
        """The pack for one unit (persona) or for every unit (no persona). Raises ValueError."""
        return encode_pack(self.project if include_emotions else Project(), persona)

    def pack_status(self):
        """(size in bytes or None, problems list) for the status bar."""
        problems = self.project.problems()
        if problems:
            return None, problems
        try:
            return len(self.pack(self.persona)), []
        except ValueError as e:
            return None, str(e).splitlines()

    def animation_names(self):
        """Built-in and project animation names, as favourites can refer to them."""
        return [n for n, _ in native.builtin_animations()] + [a.name for a in self.project.animations if a.name]

    # ---- persona ----
    def set_persona(self, persona: Persona):
        self.persona = persona
        self.personaChanged.emit()

    # ---- manifest ----
    def set_manifest(self, path, rows):
        self.manifest_path = path
        self.manifest_rows = rows
        self.manifestChanged.emit()

    def save_manifest(self):
        if self.manifest_path:
            factory.write_manifest(self.manifest_path, self.manifest_rows)
        self.manifestChanged.emit()
