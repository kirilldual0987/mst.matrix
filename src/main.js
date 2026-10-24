import * as matrixcs from 'matrix-js-sdk';
import { encryptAttachment, decryptAttachment } from 'matrix-encrypt-attachment';
import { renderEmojiPicker } from './emoji.js';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import { hydrateIcons, icon } from './icons.js';
import './style.css';

/* ════════════════════════════════════════════════════════════
   State & constants
   ════════════════════════════════════════════════════════════ */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const SESSION_KEY = 'mst.matrix.session.v1';
const PREFS_KEY = 'mst.matrix.prefs.v1';
const DRAFTS_KEY = 'mst.matrix.drafts.v1';
const BOOKMARKS_KEY = 'mst.matrix.bookmarks.v1';
const SSO_HS_KEY = 'mst.matrix.sso.homeserver';
const SSO_REMEMBER_KEY = 'mst.matrix.sso.remember';

const state = {
  client: null,
  userId: null,
  profile: { displayName: '', avatarUrl: null },
  currentRoomId: null,
  roomFilter: '',
  messageFilter: '',
  pendingFiles: [],
  drafts: {},
  bookmarks: [],
  focusMode: false,
  loadingOlder: false,
  roomAvatarFile: null,
  searchTab: 'messages',
  verify: { request: null, verifier: null, sas: null, user: null, device: null },
  cryptoReady: false,
  cryptoError: null,
  backupCheck: null,
  call: { call: null, incoming: false, video: false, startedAt: 0, timer: null, ringTimer: null, bound: new WeakSet() },
  commandItems: [],
  commandIndex: 0,
  replyingTo: null,
  typing: {},
  demo: false,
  demoRooms: [],
  demoSpaces: [],
  demoRoomId: null,
  readReceiptTimers: {},
  messageContent: new Map(),
  voice: { recorder: null, stream: null, chunks: [], startTs: 0, timer: null, cancel: false },
  mediaBlobCache: new Map(),
  mediaObjectUrls: new Map(),
  prefs: {
    theme: 'system',
    accent: 'violet',
    sound: false,
    notify: false,
  },
};

const DEMO_AUDIO = 'data:audio/wav;base64,UklGRjQnAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAnAAB/f39/f39/gICAgICAf39/fn5+fX19fHx8fH19fX19fn5+fn5+f39/f3+AgIGBgoKDg4ODg4OCgYB/fXx6eXd2dXV1dXZ3eXt9f4GEhoiJioqKiomHhoSBf317eXh3dnZ2dnd3eHl6e3x9fX5+fn9/gICBgoOEhoeIiYqKiomIhoSBfnt3dHFubGpqamttcHR4fIGGio6Rk5WVlZSRjouHg397d3RycG9vb3Bxc3R2eHl7fH19fn9/gIGCg4WGiIqMjpCQkZCPjYqGgXx3cm1oZGFfX2BiZmpwdn2Ei5GXm56goJ+dmZSPiYN9eHNvbGloaGlqbG5xc3Z4ent8fX5/gIGCg4WIio2QkpWWl5eWlJGNh4F6c2tlX1pWVFRWWV9lbXZ/iZGaoKapq6uppaCZkoqCe3RuaWViYWFjZWdqbnF0dnl7fH1+f4CCg4WIi46SlZmbnZ6enJmVjod/dm1kXFVPS0lKTVJZYmx3g46Zo6uxtba1sq2mnZSKgXdvaGJeW1pbXWBjZ2tvcnV4enx9f4CBg4WIi4+Tl5ueoaOko6Cclo+GfHJoXlVNR0RDREhOV2FteoeTn6mxtrq6ubSupp2TiH50bGVgXFpZWlxgY2dsb3N2eXt8fn+AgYOGiIyQlJicn6KjpKKfm5SNg3pvZVtSS0ZDQ0VKUVplcX2KlqGrsri6urizrKSakIV7cmpjXltZWVtdYWRpbXF0d3l7fX5/gIKEhomNkZWZnaCipKSinpmSioF3bGJZUEpFQ0NGS1NdaHSBjZmkrbS4urq3saqhl42DeXBoYl1aWVpbXmJmam5xdXh6fH1+f4GChYeKjpKWmp6ho6SjoZ2XkIh+dGpfVk5IRENER01VX2t4hJGdp6+1ubq5ta+onpSKgHZtZmBcWllaXF9jZ2tvcnZ4enx9f4CBg4WIi4+Tl5ufoqOko6Cclo6Fe3FnXVRMR0RDREhPWGNue4iUn6mxt7q6uLStpZySh310a2RfW1pZWl1gZGhscHN2eXt8fn+AgoSGiYyQlJicoKKkpKKfmpSMg3luZFpSS0ZDQ0VKUVtmcn6Ll6Kss7i6ureyq6OZj4R6cWljXltZWVtdYWVpbXF0d3l7fX5/gYKEh4qNkZWZnaCjpKOinpmSiYB2a2FYUElFQ0NGTFReaXWCj5qlrrW5urm2samgloyCeG9nYV1aWVpbXmJmam5ydXh6fH1+gIGDhYeLjpKWmp6ho6SjoZ2XkId9c2lfVU5IRENESE5WYGx5hZKeqLC2ubq5ta+nnpOJf3VtZmBcWllaXF9jZ2tvc3Z4e3x+f4CBg4WIjI+Tl5ufoqOko6CblY2EenBmXFNMRkNDRUlQWWRwfImVoKqyt7q6uLOtpJuRhnxza2RfW1lZW11gZGhscHR3eXt9fn+AgoSGiYyQlJmcoKKkpKKfmpOLgnhtY1lRSkVDQ0VLUlxnc4CMmKOss7i6ureyq6KYjoN6cGliXltZWlteYWVpbXF1d3p8fX5/gYKEh4qOkZaanaGjpKOhnZiRiX91amBXT0lEQ0NHTFReanaDkJymr7W5urm2sKiflYuBd25nYV1aWVpcX2Jmam5ydXh6fH1/gIGDhYiLj5OXm56ho6SjoJyWj4Z8cmheVU1HRENESE5XYW16h5OfqbG2urq5tK6mnZOIfnRsZWBcWllaXGBjZ2xvc3Z5e3x+f4CBg4aIjJCUmJyfoqOkop+blI2Dem9lW1JLRkNDRUpRWmVxfYqWoauyuLq6uLOspJqQhXtyamNeW1lZW11hZGltcXR3eXt9fn+AgoSGiY2RlZmdoKKkpKKemZKKgXdsYllQSkVDQ0ZLU11odIGNmaSttLi6urexqqGXjYN5cGhiXVpZWlteYmZqbnF1eHp8fX5/gYKFh4qOkpaanqGjpKOhnZeQiH50al9WTkhEQ0RHTVVfa3iEkZ2nr7W5urm1r6ielIqAdm1mYFxaWVpcX2Nna29ydnh6fH1/gIGDhYiLj5OXm5+io6SjoJyWjoV7cWddVExHRENESE9YY257iJSfqbG3urq4tK2lnJKHfXRrZF9bWllaXWBkaGxwc3Z5e3x+f4CChIaJjJCUmJygoqSkop+alIyDeW5kWlJLRkNDRUpRW2ZyfouXoqyzuLq6t7Kro5mPhHpxaWNeW1lZW11hZWltcXR3eXt9fn+BgoSHio2RlZmdoKOko6KemZKJgHZrYVhQSUVDQ0ZMVF5pdYKPmqWutbm6ubaxqaCWjIJ4b2dhXVpZWlteYmZqbnJ1eHp8fX6AgYOFh4uOkpaanqGjpKOhnZeQh31zaV9VTkhEQ0RITlZgbHmFkp6osLa5urm1r6eek4l/dW1mYFxaWVpcX2Nna29zdnh7fH5/gIGDhYiMj5OXm5+io6SjoJuVjYR6cGZcU0xGQ0NFSVBZZHB8iZWgqrK3urq4s62km5GGfHNrZF9bWVlbXWBkaGxwdHd5e31+f4CChIaJjJCUmZygoqSkop+ak4uCeG1jWVFKRUNDRUtSXGdzgIyYo6yzuLq6t7KropiOg3pwaWJeW1laW15hZWltcXV3enx9fn+BgoSHio6RlpqdoaOko6GdmJGJf3VqYFdPSURDQ0dMVF5qdoOQnKavtbm6ubawqJ+Vi4F3bmdhXVpZWlxfYmZqbnJ1eHp8fX+AgYOFiIuPk5ebnqGjpKOgnJaPhnxyaF5VTUdEQ0RITldhbXqHk5+psba6urm0rqadk4h+dGxlYFxaWVpcYGNnbG9zdnl7fH5/gIGDhoiMkJSYnJ+io6Sin5uUjYN6b2VbUktGQ0NFSlFaZXF9ipahq7K4urq4s6ykmpCFe3JqY15bWVlbXWFkaW1xdHd5e31+f4CChIaJjZGVmZ2goqSkop6ZkoqBd2xiWVBKRUNDRktTXWh0gY2ZpK20uLq6t7GqoZeNg3lwaGJdWllaW15iZmpucXV4enx9fn+BgoWHio6SlpqeoaOko6Gdl5CIfnRqX1ZOSERDREdNVV9reISRnaevtbm6ubWvqJ6UioB2bWZgXFpZWlxfY2drb3J2eHp8fX+AgYOFiIuPk5ebn6KjpKOgnJaOhXtxZ11UTEdEQ0RIT1hjbnuIlJ+psbe6uri0raWckod9dGtkX1taWVpdYGRobHBzdnl7fH5/gIKEhomMkJSYnKCipKSin5qUjIN5bmRaUktGQ0NFSlFbZnJ+i5eirLO4urq3squjmY+EenFpY15bWVlbXWFlaW1xdHd5e31+f4GChIeKjZGVmZ2go6Sjop6ZkomAdmthWFBJRUNDRkxUXml1go+apa61ubq5trGpoJaMgnhvZ2FdWllaW15iZmpucnV4enx9foCBg4WHi46SlpqeoaOko6Gdl5CHfXNpX1VOSERDREhOVmBseYWSnqiwtrm6ubWvp56TiX91bWZgXFpZWlxfY2drb3N2eHt8fn+AgYOFiIyPk5ebn6KjpKOgm5WNhHpwZlxTTEZDQ0VJUFlkcHyJlaCqsre6urizraSbkYZ8c2tkX1tZWVtdYGRobHB0d3l7fX5/gIKEhomMkJSZnKCipKSin5qTi4J4bWNZUUpFQ0NFS1JcZ3OAjJijrLO4urq3squimI6DenBpYl5bWVpbXmFlaW1xdXd6fH1+f4GChIeKjpGWmp2ho6SjoZ2YkYl/dWpgV09JRENDR0xUXmp2g5Ccpq+1ubq5trCon5WLgXduZ2FdWllaXF9iZmpucnV4enx9f4CBg4WIi4+Tl5ueoaOko6Cclo+GfHJoXlVNR0RDREhOV2FteoeTn6mxtrq6ubSupp2TiH50bGVgXFpZWlxgY2dsb3N2eXt8fn+AgYOGiIyQlJicn6KjpKKfm5SNg3pvZVtSS0ZDQ0VKUVplcX2KlqGrsri6urizrKSakIV7cmpjXltZWVtdYWRpbXF0d3l7fX5/gIKEhomNkZWZnaCipKSinpmSioF3bGJZUEpFQ0NGS1NdaHSBjZmkrbS4urq3saqhl42DeXBoYl1aWVpbXmJmam5xdXh6fH1+f4GChYeKjpKWmp6ho6SjoZ2XkIh+dGpfVk5IRENER01VX2t4hJGdp6+1ubq5ta+onpSKgHZtZmBcWllaXF9jZ2tvcnZ4enx9f4CBg4WIi4+Tl5ufoqOko6Cclo6Fe3FnXVRMR0RDREhPWGNue4iUn6mxt7q6uLStpZySh310a2RfW1pZWl1gZGhscHN2eXt8fn+AgoSGiYyQlJicoKKkpKKfmpSMg3luZFpSS0ZDQ0VKUVtmcn6Ll6Kss7i6ureyq6OZj4R6cWljXltZWVtdYWVpbXF0d3l7fX5/gYKEh4qNkZWZnaCjpKOinpmSiYB2a2FYUElFQ0NGTFReaXWCj5qlrrW5urm2samgloyCeG9nYV1aWVpbXmJmam5ydXh6fH1+gIGDhYeLjpKWmp6ho6SjoZ2XkId9c2lfVU5IRENESE5WYGx5hZKeqLC2ubq5ta+nnpOJf3VtZmBcWllaXF9jZ2tvc3Z4e3x+f4CBg4WIjI+Tl5ufoqOko6CblY2EenBmXFNMRkNDRUlQWWRwfImVoKqyt7q6uLOtpJuRhnxza2RfW1lZW11gZGhscHR3eXt9fn+AgoSGiYyQlJmcoKKkpKKfmpOLgnhtY1lRSkVDQ0VLUlxnc4CMmKOss7i6ureyq6KYjoN6cGliXltZWlteYWVpbXF1d3p8fX5/gYKEh4qOkZaanaGjpKOhnZiRiX91amBXT0lEQ0NHTFReanaDkJymr7W5urm2sKiflYuBd25nYV1aWVpcX2Jmam5ydXh6fH1/gIGDhYiLj5OXm56ho6SjoJyWj4Z8cmheVU1HRENESE5XYW16h5OfqbG2urq5tK6mnZOIfnRsZWBcWllaXGBjZ2xvc3Z5e3x+f4CBg4aIjJCUmJyfoqOkop+blI2Dem9lW1JLRkNDRUpRWmVxfYqWoauyuLq6uLOspJqQhXtyamNeW1lZW11hZGltcXR3eXt9fn+AgoSGiY2RlZmdoKKkpKKemZKKgXdsYllQSkVDQ0ZLU11odIGNmaSttLi6urexqqGXjYN5cGhiXVpZWlteYmZqbnF1eHp8fX5/gYKFh4qOkpaanqGjpKOhnZeQiH50al9WTkhEQ0RHTVVfa3iEkZ2nr7W5urm1r6ielIqAdm1mYFxaWVpcX2Nna29ydnh6fH1/gIGDhYiLj5OXm5+io6SjoJyWjoV7cWddVExHRENESE9YY257iJSfqbG3urq4tK2lnJKHfXRrZF9bWllaXWBkaGxwc3Z5e3x+f4CChIaJjJCUmJygoqSkop+alIyDeW5kWlJLRkNDRUpRW2ZyfouXoqyzuLq6t7Kro5mPhHpxaWNeW1lZW11hZWltcXR3eXt9fn+BgoSHio2RlZmdoKOko6KemZKJgHZrYVhQSUVDQ0ZMVF5pdYKPmqWutbm6ubaxqaCWjIJ4b2dhXVpZWlteYmZqbnJ1eHp8fX6AgYOFh4uOkpaanqGjpKOhnZeQh31zaV9VTkhEQ0RITlZgbHmFkp6osLa5urm1r6eek4l/dW1mYFxaWVpcX2Nna29zdnh7fH5/gIGDhYiMj5OXm5+io6SjoJuVjYR6cGZcU0xGQ0NFSVBZZHB8iZWgqrK3urq4s62km5GGfHNrZF9bWVlbXWBkaGxwdHd5e31+f4CChIaJjJCUmZygoqSkop+ak4uCeG1jWVFKRUNDRUtSXGdzgIyYo6yzuLq6t7KropiOg3pwaWJeW1laW15hZWltcXV3enx9fn+BgoSHio6RlpqdoaOko6GdmJGJf3VqYFdPSURDQ0dMVF5qdoOQnKavtbm6ubawqJ+Vi4F3bmdhXVpZWlxfYmZqbnJ1eHp8fX+AgYOFiIuPk5ebnqGjpKOgnJaPhnxyaF5VTUdEQ0RITldhbXqHk5+psba6urm0rqadk4h+dGxlYFxaWVpcYGNnbG9zdnl7fH5/gIGDhoiMkJSYnJ+io6Sin5uUjYN6b2VbUktGQ0NFSlFaZXF9ipahq7K4urq4s6ykmpCFe3JqY15bWVlbXWFkaW1xdHd5e31+f4CChIaJjZGVmZ2goqSkop6ZkoqBd2xiWVBKRUNDRktTXWh0gY2ZpK20uLq6t7GqoZeNg3lwaGJdWllaW15iZmpucXV4enx9fn+BgoWHio6SlpqeoaOko6Gdl5CIfnRqX1ZOSERDREdNVV9reISRnaevtbm6ubWvqJ6UioB2bWZgXFpZWlxfY2drb3J2eHp8fX+AgYOFiIuPk5ebn6KjpKOgnJaOhXtxZ11UTEdEQ0RIT1hjbnuIlJ+psbe6uri0raWckod9dGtkX1taWVpdYGRobHBzdnl7fH5/gIKEhomMkJSYnKCipKSin5qUjIN5bmRaUktGQ0NFSlFbZnJ+i5eirLO4urq3squjmY+EenFpY15bWVlbXWFlaW1xdHd5e31+f4GChIeKjZGVmZ2go6Sjop6ZkomAdmthWFBJRUNDRkxUXml1go+apa61ubq5trGpoJaMgnhvZ2FdWllaW15iZmpucnV4enx9foCBg4WHi46SlpqeoaOko6Gdl5CHfXNpX1VOSERDREhOVmBseYWSnqiwtrm6ubWvp56TiX91bWZgXFpZWlxfY2drb3N2eHt8fn+AgYOFiIyPk5ebn6KjpKOgm5WNhHpwZlxTTEZDQ0VJUFlkcHyJlaCqsre6urizraSbkYZ8c2tkX1tZWVtdYGRobHB0d3l7fX5/gIKEhomMkJSZnKCipKSin5qTi4J4bWNZUUpFQ0NFS1JcZ3OAjJijrLO4urq3squimI6DenBpYl5bWVpbXmFlaW1xdXd6fH1+f4GChIeKjpGWmp2ho6SjoZ2YkYl/dWpgV09JRENDR0xUXmp2g5Ccpq+1ubq5trCon5WLgXduZ2FdWllaXF9iZmpucnV4enx9f4CBg4WIi4+Tl5ueoaOko6Cclo+GfHJoXlVNR0RDREhOV2FteoeTn6mxtrq6ubSupp2TiH50bGVgXFpZWlxgY2dsb3N2eXt8fn+AgYOGiIyQlJicn6KjpKKfm5SNg3pvZVtSS0ZDQ0VKUVplcX2KlqGrsri6urizrKSakIV7cmpjXltZWVtdYWRpbXF0d3l7fX5/gIKEhomNkZWZnaCipKSinpmSioF3bGJZUEpFQ0NGS1NdaHSBjZmkrbS4urq3saqhl42DeXBoYl1aWVpbXmJmam5xdXh6fH1+f4GChYeKjpKWmp6ho6SjoZ2XkIh+dGpfVk5IRENER01VX2t4hJGdp6+1ubq5ta+onpSKgHZtZmBcWllaXF9jZ2tvcnZ4enx9f4CBg4WIi4+Tl5ufoqOko6Cclo6Fe3FnXVRMR0RDREhPWGNue4iUn6mxt7q6uLStpZySh310a2RfW1pZWl1gZGhscHN2eXt8fn+AgoSGiYyQlJicoKKkpKKfmpSMg3luZFpSS0ZDQ0VKUVtmcn6Ll6Kss7i6ureyq6OZj4R6cWljXltZWVtdYWVpbXF0d3l7fX5/gYKEh4qNkZWZnaCjpKOinpmSiYB2a2FYUElFQ0NGTFReaXWCj5qlrrW5urm2samgloyCeG9nYV1aWVpbXmJmam5ydXh6fH1+gIGDhYeLjpKWmp6ho6SjoZ2XkId9c2lfVU5IRENESE5WYGx5hZKeqLC2ubq5ta+nnpOJf3VtZmBcWllaXF9jZ2tvc3Z4e3x+f4CBg4WIjI+Tl5ufoqOko6CblY2EenBmXFNMRkNDRUlQWWRwfImVoKqyt7q6uLOtpJuRhnxza2RfW1lZW11gZGhscHR3eXt9fn+AgoSGiYyQlJmcoKKkpKKfmpOLgnhtY1lRSkVDQ0VLUlxnc4CMmKOss7i6ureyq6KYjoN6cGliXltZWlteYWVpbXF1d3p8fX5/gYKEh4qOkZaanaGjpKOhnZiRiX91amBXT0lEQ0NHTFReanaDkJymr7W5urm2sKiflYuBd25nYV1aWVpcX2Jmam5ydXh6fH1/gIGDhYiLj5OXm56ho6SjoJyWj4Z8cmheVU1HRENESE5XYW16h5OfqbG2urq5tK6mnZOIfnRsZWBcWllaXGBjZ2xvc3Z5e3x+f4CBg4aIjJCUmJyfoqOkop+blI2Dem9lW1JLRkNDRUpRWmVxfYqWoauyuLq6uLOspJqQhXtyamNeW1lZW11hZGltcXR3eXt9fn+AgoSGiY2RlZmdoKKkpKKemZKKgXdsYllQSkVDQ0ZLU11odIGNmaSttLi6urexqqGXjYN5cGhiXVpZWlteYmZqbnF1eHp8fX5/gYKFh4qOkpaanqGjpKOhnZeQiH50al9WTkhEQ0RHTVVfa3iEkZ2nr7W5urm1r6ielIqAdm1mYFxaWVpcX2Nna29ydnh6fH1/gIGDhYiLj5OXm5+io6SjoJyWjoV7cWddVExHRENESE9YY257iJSfqbG3urq4tK2lnJKHfXRrZF9bWllaXWBkaGxwc3Z5e3x+f4CChIaJjJCUmJygoqSkop+alIyDeW5kWlJLRkNDRUpRW2ZyfouXoqyzuLq6t7Kro5mPhHpxaWNeW1lZW11hZWltcXR3eXt9fn+BgoSHio2RlZmdoKOko6KemZKJgHZrYVhQSUVDQ0ZMVF5pdYKPmqWutbm6ubaxqaCWjIJ4b2dhXVpZWlteYmZqbnJ1eHp8fX6AgYOFh4uOkpaanqGjpKOhnZeQh31zaV9VTkhEQ0RITlZgbHmFkp6osLa5urm1r6eek4l/dW1mYFxaWVpcX2Nna29zdnh7fH5/gIGDhYiMj5OXm5+io6SjoJuVjYR6cGZcU0xGQ0NFSVBZZHB8iZWgqrK3urq4s62km5GGfHNrZF9bWVlbXWBkaGxwdHd5e31+f4CChIaJjJCUmZygoqSkop+ak4uCeG1jWVFKRUNDRUtSXGdzgIyYo6yzuLq6t7KropiOg3pwaWJeW1laW15hZWltcXV3enx9fn+BgoSHio6RlpqdoaOko6GdmJGJf3VqYFdPSURDQ0dMVF5qdoOQnKavtbm6ubawqJ+Vi4F3bmdhXVpZWlxfYmZqbnJ1eHp8fX+AgYOFiIuPk5ebnqGjpKOgnJaPhnxyaF5VTUdEQ0RITldhbXqHk5+psba6urm0rqadk4h+dGxlYFxaWVpcYGNnbG9zdnl7fH5/gIGDhoiMkJSYnJ+io6Sin5uUjYN6b2VbUktGQ0NFSlFaZXF9ipahq7K4urq4s6ykmpCFe3JqY15bWVlbXWFkaW1xdHd5e31+f4CChIaJjZGVmZ2goqSkop6ZkoqBd2xiWVBKRUNDRktTXWh0gY2ZpK20uLq6t7GqoZeNg3lwaGJdWllaW15iZmpucXV4enx9fn+BgoWHio6SlpqeoaOko6Gdl5CIfnRqX1ZOSERDREdNVV9reISRnaevtbm6ubWvqJ6UioB2bWZgXFpZWlxfY2drb3J2eHp8fX+AgYOFiIuPk5ebn6KjpKOgnJaOhXtxZ11UTEdEQ0RIT1hjbnuIlJ+psbe6uri0raWckod9dGtkX1taWVpdYGRobHBzdnl7fH5/gIKEhomMkJSYnKCipKSin5qUjIN5bmRaUktGQ0NFSlFbZnJ+i5eirLO4urq3squjmY+EenFpY15bWVlbXWFlaW1xdHd5e31+f4GChIeKjZGVmZ2go6Sjop6ZkomAdmthWFBJRUNDRkxUXml1go+apa61ubq5trGpoJaMgnhvZ2FdWllaW15iZmpucnV4enx9foCBg4WHi46SlpqeoaOko6Gdl5CHfXNpX1VOSERDREhOVmBseYWSnqiwtrm6ubWvp56TiX91bWZgXFpZWlxfY2drb3N2eHt8fn+AgYOFiIyPk5ebn6KjpKOgm5WNhHpwZlxTTEZDQ0VJUFlkcHyJlaCqsre6urizraSbkYZ8c2tkX1tZWVtdYGRobHB0d3l7fX5/gIKEhomMkJSZnKCipKSin5qTi4J4bWNZUUpFQ0NFS1JcZ3OAjJijrLO4urq3squimI6DenBpYl5bWVpbXmFlaW1xdXd6fH1+f4GChIeKjpGWmp2ho6SjoZ2YkYl/dWpgV09JRENDR0xUXmp2g5Ccpq+1ubq5trCon5WLgXduZ2FdWllaXF9iZmpucnV4enx9f4CBg4WIi4+Tl5ueoaOko6Cclo+GfHJoXlVNR0RDREhOV2FteoeTn6mxtrq6ubSupp2TiH50bGVgXFpZWlxgY2dsb3N2eXt8fn+AgYOGiIyQlJicn6KjpKKfm5SNg3pvZVtSS0ZDQ0VKUVplcX2KlqGrsri6urizrKSakIV7cmpjXltZWVtdYWRpbXF0d3l7fX5/gIKEhomNkZWZnaCipKSinpmSioF3bGJZUEpFQ0NGS1NdaHSBjZmkrbS4urq3saqhl42DeXBoYl1aWVpbXmJmam5xdXh6fH1+f4GChYeKjpKWmp6ho6SjoZ2XkIh+dGpfVk5IRENER01VX2t4hJGdp6+1ubq5ta+onpSKgHZtZmBcWllaXF9jZ2tvcnZ4enx9f4CBg4WIi4+Tl5ufoqOko6Cclo6Fe3FnXVRMR0RDREhPWGNue4iUn6mxt7q6uLStpZySh310a2RfW1pZWl1gZGhscHN2eXt8fn+AgoSGiYyQlJicoKKkpKKfmpSMg3luZFpSS0ZDQ0VKUVtmcn6Ll6Kss7i6ureyq6OZj4R6cWljXltZWVtdYWVpbXF0d3l7fX5/gYKEh4qNkZWZnaCjpKOinpmSiYB2a2FYUElFQ0NGTFReaXWCj5qlrrW5urm2samgloyCeG9nYV1aWVpbXmJmam5ydXh6fH1+gIGDhYeLjpKWmp6ho6SjoZ2XkId9c2lfVU5IRENESE5WYGx5hZKeqLC2ubq5ta+nnpOJf3VtZmBcWllaXF9jZ2tvc3Z4e3x+f4CBg4WIjI+Tl5ufoqOko6CblY2EenBmXFNMRkNDRUlQWWRwfImVoKqyt7q6uLOtpJuRhnxza2RfW1lZW11gZGhscHR3eXt9fn+AgoSGiYyQlJmcoKKkpKKfmpOLgnhtY1lRSkVDQ0VLUlxnc4CMmKOss7i6ureyq6KYjoN6cGliXltZWlteYWVpbXF1d3p8fX5/gYKEh4qOkZaanaGjpKOhnZiRiX91amBXT0lEQ0NHTFReanaDkJymr7W5urm2sKiflYuBd25nYV1aWVpcX2Jmam5ydXh6fH1/gIGDhYiLj5OXm56ho6SjoJyWj4Z8cmheVU1HRENESE5XYW16h5OfqbG2urq5tK6mnZOIfnRsZWBcWllaXGBjZ2xvc3Z5e3x+f4CBg4aIjJCUmJyfoqOkop+blI2Dem9lW1JLRkNDRUpRWmVxfYqWoauyuLq6uLOspJqQhXtyamNeW1lZW11hZGltcXR3eXt9fn+AgoSGiY2RlZmdoKKkpKKemZKKgXdsYllQSkVDQ0ZLU11odIGNmaSttLi6urexqqGXjYN5cGhiXVpZWlteYmZqbnF1eHp8fX5/gYKFh4qOkpaanqGjpKOhnZeQiH50al9WTkhEQ0RHTVVfa3iEkZ2nr7W5urm1r6ielIqAdm1mYFxaWVpcX2Nna29ydnh6fH1/gIGDhYiLj5OXm5+io6SjoJyWjoV7cWddVExHRENESE9YY257iJSfqbG3urq4tK2lnJKHfXRrZF9bWllaXWBkaGxwc3Z5e3x+f4CChIaJjJCUmJygoqSkop+alIyDeW5kWlJLRkNDRUpRW2Zyf4uXoqyzuLq6t7Kro5mPhHpxaWNeW1lZW11hZWltcXR3eXt9fn+BgoSHio2RlZmdoKOko6KemZKJgHZrYVhQSUVDQ0ZMVF5pdYKPmqWutbm6ubaxqaCWjIJ4b2dhXVpZWlteYmZqbnJ1eHp8fX6AgYOFh4uOkpaanqGjpKOhnZeQh31zaV9VTkhEQ0RITlZgbHmFkp6osLa5urm1r6eek4l/dW1mYFxaWVpcX2Nna29zdnh7fH5/gIGDhYiMj5OXm5+io6SjoJuVjYR6cGZcU0xGQ0NFSVBZZHB8iZWgqrK3urq4s62km5GGfHNrZF9bWVlbXWBkaGxwdHd5e31+f4CChIaJjJCUmJyfoaOioZ6ZkouCeG5kW1NMSEZGSE1UXWh0gIyXoaqwtbe2s66ooJaNg3pxamRgXVxcXmBkZ2tvcnV4enx9fn+AgoSGiYyQk5eanZ+gn56alY+Hf3ZtZFxVT0tKS05TWmNtd4ONmKGorrGysa6popuSiYB4cWplYmBfX2FkZ2pucXR3eXt8fn9/gYKEhomMj5KWmZudnZyal5KMhX10bGRdV1JPTlBTWF9ncXuFj5igpqutrqyppJ2WjoZ+d3BrZmRiYmNkZ2ptcHN2eHp8fX5/gIGChIaJi46RlJeZmpqZl5OPiYJ7c2xlXllVU1NVWF1kbHV+h5CYnqSnqamnpJ+ZkouDfHZwa2hmZWVmZ2psb3J1d3l7fH1+f4CBgoSGiIuOkJOVl5eXlpSQjIaAeXNsZmBcWVhYWl1iaXB4gIiQl5yho6Wkop+alI6IgXt1cG1qaGdoaWptb3J0d3l6fH1+fn+AgYKEhoiKjY+Rk5SVlJOQjYmEfnhybGdjX11cXV9iZ21ze4KJj5WanZ+gn52alZCLhX96dXFubGtqa2xtb3J0dnh6e3x9fn9/gIGCg4WHiYuNj5GSkpGQjYqGgn14cm5pZWNhYWFkZ2txd32DiY+Tl5qbm5qYlZGNiIN+eXVycG5tbW5vcHJ0dnh5e3x9fn5/f4CBgoOFhoiKjI2Oj4+OjYuIhIB8d3Nva2hmZWVmaGtvdHl+hImNkZSWl5eWlJGNiYWBfXl2dHJwcHBxcnN1dnh5e3x9fX5+f3+AgYKDhIWHiIqLjIyMi4qIhYJ/e3h0cW5sampqa21wc3d7gISIjI6RkpKSkY+NioaDgHx5d3V0c3Nzc3R2d3h5e3x8fX5+fn9/gICBgoOEhoeIiYmJiYiHhYOBfnt4dnNxb25ub3BxdHZ6fYCEh4mLjY6OjYyLiYaEgX98enh3dnZ1dnZ3eHl6e3x8fX5+fn9/f4CAgYGCg4SFhYaGhoaFhYOCgH58eXh2dHNzc3N0dXd5fH6Ag4WHiImJiYmIh4WDgoB+fHt6eXl4eHl5enp7fHx9fX5+fn5/f39/gICBgYKCg4ODhISDg4KBgH9+fHt6eXh3d3d4eHl6fH1/gIGDhISFhYWEhIOCgYB/fn18fHt7e3t7fHx8fX19fn5+fn5+f39/f39/gICAgICBgYGBgYCAgH9/fn19fXx8fHx8fHx9fX5+f3+AgICAgICAgICAf39/f35+fn5+fn5+fn5+fn5+fn5+fn5+';

const watchedTypingMembers = new WeakSet();

/* ═
   Small utilities
   ════════════════════════════════════════════════════════════ */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str = '') {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

function hueFor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function initials(name = '?') {
  const cleaned = name.replace(/^[@#]/, '').trim();
  return (cleaned[0] || '#').toUpperCase();
}

function normalizeHomeserver(url) {
  let u = (url || '').trim();
  if (!u) return 'https://matrix.org';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

function normalizeUserId(id, homeserver) {
  let u = (id || '').trim();
  if (!u) return '';
  if (!u.startsWith('@')) u = '@' + u;
  if (!u.includes(':')) {
    try {
      const host = new URL(homeserver).hostname;
      u += ':' + host;
    } catch {
      u += ':matrix.org';
    }
  }
  return u;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86400000;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

function formatListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86400000;
  if (diff === 0) return formatTime(ts);
  if (diff === 1) return 'Вчера';
  if (diff < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatBytes(n = 0) {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function mdHtml(html) {
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(
    /(https?:\/\/[^\s<]+[^\s<.,:;"')\]}])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
  return html;
}

function formatText(text = '') {
  return mdHtml(escapeHtml(text));
}

function escapeRegExp(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionMap(room) {
  const map = new Map();
  const members = state.demo
    ? (room?.members || []).map((m) => ({ userId: m.id, name: m.name }))
    : (room?.getMembers?.() || []).map((m) => ({ userId: m.userId, name: m.name }));
  for (const member of members) {
    if (member.userId && member.userId !== state.userId) map.set(member.userId, member.name);
  }
  if (state.userId && state.profile.displayName) map.set(state.userId, state.profile.displayName);
  return map;
}

function formatTextWithMentions(text, room) {
  let html = escapeHtml(text);
  const map = mentionMap(room);
  for (const [userId, name] of map) {
    if (!userId) continue;
    const rx = new RegExp(`@${escapeRegExp(userId.replace(/^@/, ''))}`, 'g');
    html = html.replace(rx, `<span class="mention-pill">@${escapeHtml(name || userId)}</span>`);
  }
  return mdHtml(html);
}

function mxcToUrl(mxc, w = 800, h = 800, method = 'scale') {
  if (!mxc || !state.client) return '';
  if (!String(mxc).startsWith('mxc://')) return String(mxc);
  try {
    return state.client.mxcUrlToHttp(mxc, w, h, method, true, true, false) || '';
  } catch {
    return '';
  }
}

function attachmentMxc(content) {
  return content?.file?.url || content?.url || '';
}

function attachmentCacheKey(content) {
  return `${attachmentMxc(content)}|${content?.file?.key?.k || ''}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function fetchMediaBytes(mxc) {
  if (!mxc) throw new Error('Нет ссылки на файл');
  const candidates = [];

  if (state.client && mxc.startsWith('mxc://')) {
    try {
      const authUrl = state.client.mxcUrlToHttp(mxc, undefined, undefined, undefined, true, true, true);
      if (authUrl) candidates.push({ url: authUrl, auth: true });
    } catch {}
    try {
      const plainUrl = state.client.mxcUrlToHttp(mxc, undefined, undefined, undefined, true, true, false);
      if (plainUrl) candidates.push({ url: plainUrl, auth: false });
    } catch {}
  }
  if (/^(https?:|blob:|data:)/.test(mxc)) candidates.push({ url: mxc, auth: false });

  let lastError;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate.url, {
        headers: candidate.auth && state.client
          ? { Authorization: `Bearer ${state.client.getAccessToken()}` }
          : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Не удалось загрузить файл');
}

async function resolveAttachmentBlob(content) {
  const cacheKey = attachmentCacheKey(content);
  if (state.mediaBlobCache.has(cacheKey)) return state.mediaBlobCache.get(cacheKey);

  const promise = (async () => {
    const mxc = attachmentMxc(content);
    if (!mxc) throw new Error('Файл недоступен');
    const ciphertext = await fetchMediaBytes(mxc);
    let data = ciphertext;
    if (content.file) {
      data = await decryptAttachment(ciphertext, content.file);
    }
    const type = content.info?.mimetype || (content.file ? 'application/octet-stream' : '');
    return new Blob([data], { type });
  })();

  state.mediaBlobCache.set(cacheKey, promise);
  promise.catch(() => state.mediaBlobCache.delete(cacheKey));
  return promise;
}

async function resolveAttachmentUrl(content) {
  const key = attachmentCacheKey(content);
  if (state.mediaObjectUrls.has(key)) return state.mediaObjectUrls.get(key);
  const blob = await resolveAttachmentBlob(content);
  const url = URL.createObjectURL(blob);
  state.mediaObjectUrls.set(key, url);
  return url;
}

async function downloadAttachment(content, name = 'file') {
  const blob = await resolveAttachmentBlob(content);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function avatarHtml(name, mxcOrUrl, cls = '') {
  const hue = hueFor(name || '?');
  const raw = String(mxcOrUrl || '');
  const url = mxcOrUrl
    ? (/^(https?:|blob:|data:)/.test(raw) ? raw : mxcToUrl(mxcOrUrl, 96, 96, 'crop'))
    : '';
  if (url) {
    const isMxc = String(mxcOrUrl || '').startsWith('mxc://');
    return `<span class="avatar ${cls}" style="--av:${hue}"><img src="${escapeAttr(url)}" alt="" loading="lazy" data-avatar-fallback="${escapeAttr(initials(name))}" ${isMxc ? `data-avatar-mxc="${escapeAttr(mxcOrUrl)}" data-media-w="96" data-media-h="96" data-media-method="crop"` : ''} /></span>`;
  }
  return `<span class="avatar ${cls}" style="--av:${hue}">${escapeHtml(initials(name))}</span>`;
}

function setIcon(el, name) {
  if (!el) return;
  el.innerHTML = icon(name);
}

function initDomainBanner() {
  const banner = $('#domain-banner');
  if (!banner) return;
  const hide = () => {
    clearTimeout(banner._hideTimer);
    banner.classList.remove('show');
    setTimeout(() => banner.classList.add('hidden'), 320);
  };
  banner.classList.remove('hidden');
  requestAnimationFrame(() => banner.classList.add('show'));
  banner._hideTimer = setTimeout(hide, 10000);
  $('#domain-banner-close')?.addEventListener('click', hide);
}

function updateConnectionBanner() {
  const banner = $('#connection-banner');
  if (!banner) return;
  banner.classList.toggle('hidden', navigator.onLine !== false);
}

function debounce(fn, ms = 60) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toast(message, type = 'info', ms = 3200) {
  const stack = $('#toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'sparkles')}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'opacity .25s, transform .25s';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ════════════════════════════════════════════════════════════
   Preferences / theme
   ════════════════════════════════════════════════════════════ */
function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    state.prefs = { ...state.prefs, ...stored };
  } catch {}
  applyTheme();
  applyAccent();
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch {}
}

function loadUserData() {
  try {
    const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
    if (drafts && typeof drafts === 'object') state.drafts = drafts;
  } catch {}
  try {
    const bookmarks = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
    if (Array.isArray(bookmarks)) state.bookmarks = bookmarks;
  } catch {}
}

function saveDrafts() {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(state.drafts)); } catch {}
}

function saveBookmarks() {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(state.bookmarks)); } catch {}
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme() {
  const resolved = resolveTheme(state.prefs.theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0e0e13' : '#f6f5fa';
  $$('#theme-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeValue === state.prefs.theme);
  });
}

function applyAccent() {
  document.documentElement.dataset.accent = state.prefs.accent;
  $$('#accent-row .accent-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.accentValue === state.prefs.accent);
  });
}

/* ════════════════════════════════════════════════════════════
   Session
   ════════════════════════════════════════════════════════════ */
function savedDeviceKey(homeserver, userId) {
  return `mst.matrix.device.v1|${homeserver}|${userId}`;
}

function loadSavedDeviceId(homeserver, userId) {
  try {
    return localStorage.getItem(savedDeviceKey(homeserver, userId)) || undefined;
  } catch {
    return undefined;
  }
}

function saveDeviceId(homeserver, userId, deviceId) {
  if (!deviceId) return;
  try {
    localStorage.setItem(savedDeviceKey(homeserver, userId), deviceId);
  } catch {}
}

function saveSession(session, remember = true) {
  const json = JSON.stringify(session);
  try {
    if (remember) {
      localStorage.setItem(SESSION_KEY, json);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, json);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   Auth
   ════════════════════════════════════════════════════════════ */
function setAuthError(msg = '') {
  const el = $('#login-error');
  if (el) el.textContent = msg;
}

function setLoginLoading(loading, label = 'Войти') {
  const btn = $('#login-btn');
  if (!btn) return;
  btn.disabled = loading;
  const spinner = $('.spinner', btn);
  const text = $('.btn-label', btn);
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (text) text.textContent = loading ? 'Подключение…' : label;
}

async function waitForPrepared(client, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.off('sync', onSync);
      reject(new Error('Синхронизация заняла слишком много времени. Проверьте homeserver.'));
    }, timeout);

    function onSync(syncState) {
      if (syncState !== 'PREPARED' || settled) return;
      settled = true;
      clearTimeout(timer);
      client.off('sync', onSync);
      resolve();
    }
    client.on('sync', onSync);
  });
}

async function prepareCrypto(client) {
  state.cryptoReady = false;
  state.cryptoError = null;
  try {
    if (!client.getCrypto?.()) {
      await client.initRustCrypto({ useIndexedDB: true });
    }
    state.cryptoReady = !!client.getCrypto?.();
    // Backup checks can be slow; do not block login/sync on them.
    const crypto = client.getCrypto();
    crypto.loadSessionBackupPrivateKeyFromSecretStorage().catch(() => {});
    crypto.checkKeyBackupAndEnable()
      .then((check) => {
        state.backupCheck = check;
        refreshBackupStatus();
      })
      .catch(() => {});
  } catch (err) {
    state.cryptoError = err?.message || String(err);
    console.warn('E2EE init unavailable:', err);
  }
  refreshSecurityPanel();
}

async function retryE2EEInit() {
  if (!state.client) return;
  await prepareCrypto(state.client);
  if (state.cryptoReady) toast('E2EE инициализировано', 'success');
  else toast(`E2EE: ${state.cryptoError || 'не удалось инициализировать'}`, 'error');
  refreshSecurityPanel();
}

async function completeAuthenticatedLogin(loginResponse, homeserver, fallbackUserId, remember = true) {
  if (!loginResponse?.access_token || !loginResponse?.device_id) {
    throw new Error('Homeserver не вернул access_token/device_id — вход невозможен.');
  }
  const userId = loginResponse.user_id || fallbackUserId;
  const client = matrixcs.createClient({
    baseUrl: homeserver,
    userId,
    accessToken: loginResponse.access_token,
    deviceId: loginResponse.device_id,
  });
  state.userId = userId;
  saveDeviceId(homeserver, userId, loginResponse.device_id);
  attachClient(client);
  await prepareCrypto(client);
  const ready = waitForPrepared(client);
  client.startClient({ initialSyncLimit: 40, lazyLoadMembers: true, threadSupport: true });
  await ready;
  saveSession({
    baseUrl: homeserver,
    userId,
    accessToken: client.getAccessToken(),
    deviceId: client.getDeviceId(),
  }, remember);
  await finishLogin();
  return client;
}

function setSsoLoading(loading) {
  const btn = $('#sso-btn');
  if (!btn) return;
  btn.disabled = loading;
  const label = $('.sso-label', btn);
  if (label) label.textContent = loading ? 'Переходим на homeserver…' : 'Войти через SSO';
}

async function startSsoLogin() {
  setAuthError('');
  const homeserver = normalizeHomeserver($('#homeserver').value);
  setSsoLoading(true);
  try {
    const bootstrap = matrixcs.createClient({ baseUrl: homeserver });
    const flows = await bootstrap.loginFlows();
    const sso = (flows.flows || []).find((flow) => String(flow.type || '').startsWith('m.login.sso'));
    if (!sso) {
      throw new Error('Этот homeserver не поддерживает вход через SSO.');
    }
    localStorage.setItem(SSO_HS_KEY, homeserver);
    localStorage.setItem(SSO_REMEMBER_KEY, $('#remember')?.checked === false ? '0' : '1');
    const redirectUrl = `${window.location.origin}${window.location.pathname}?sso_hs=${encodeURIComponent(homeserver)}`;
    const ssoUrl = bootstrap.getSsoLoginUrl(redirectUrl, 'sso');
    window.location.assign(ssoUrl);
  } catch (err) {
    console.warn('SSO start failed', err);
    setAuthError(err?.message || 'Не удалось начать вход через SSO.');
    setSsoLoading(false);
  }
}

async function handleSsoCallback() {
  const search = new URLSearchParams(window.location.search);
  let loginToken = search.get('loginToken');
  let hashParams = null;
  if (window.location.hash) {
    hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (!loginToken) loginToken = hashParams.get('loginToken');
  }
  const error = search.get('error') || hashParams?.get('error') || '';
  if (!loginToken && !error) return false;

  const cleanUrl = window.location.pathname + (window.location.hash === '#demo' ? '' : '');
  window.history.replaceState({}, document.title, cleanUrl || '/');
  if (error) {
    setAuthError(search.get('error_description') || hashParams?.get('error_description') || `SSO: ${error}`);
    return true;
  }

  const homeserver = normalizeHomeserver(search.get('sso_hs') || localStorage.getItem(SSO_HS_KEY) || $('#homeserver')?.value || 'https://matrix.org');
  const remember = localStorage.getItem(SSO_REMEMBER_KEY) !== '0';
  setLoginLoading(true);
  try {
    const bootstrap = matrixcs.createClient({ baseUrl: homeserver });
    const loginResponse = await bootstrap.loginRequest({
      type: 'm.login.token',
      token: loginToken,
      initial_device_display_name: 'mst.matrix web',
    });
    await completeAuthenticatedLogin(loginResponse, homeserver, loginResponse.user_id, remember);
    toast('Добро пожаловать в mst.matrix', 'success');
  } catch (err) {
    console.error('SSO callback failed', err);
    try { state.client?.stopClient(); } catch {}
    state.client = null;
    let msg = err?.message || 'Не удалось завершить вход через SSO.';
    if (/fetch|network|Failed/i.test(msg)) msg = 'Не удалось подключиться к homeserver. Проверьте адрес и CORS.';
    setAuthError(msg);
  } finally {
    localStorage.removeItem(SSO_HS_KEY);
    localStorage.removeItem(SSO_REMEMBER_KEY);
    setLoginLoading(false);
  }
  return true;
}

async function handleLogin(e) {
  e.preventDefault();
  setAuthError('');

  const homeserver = normalizeHomeserver($('#homeserver').value);
  const userId = normalizeUserId($('#user-id').value, homeserver);
  const password = $('#password').value;

  if (!userId || !password) {
    setAuthError('Введите Matrix ID и пароль.');
    return;
  }

  setLoginLoading(true);
  try {
    const bootstrap = matrixcs.createClient({ baseUrl: homeserver, userId });
    const existingDeviceId = loadSavedDeviceId(homeserver, userId);
    const loginResponse = await bootstrap.loginRequest({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: userId },
      password,
      ...(existingDeviceId ? { device_id: existingDeviceId } : {}),
      initial_device_display_name: 'mst.matrix web',
    });
    const remember = $('#remember')?.checked !== false;
    await completeAuthenticatedLogin(loginResponse, homeserver, userId, remember);
    toast('Добро пожаловать в mst.matrix', 'success');
  } catch (err) {
    console.error(err);
    try { state.client?.stopClient(); } catch {}
    state.client = null;
    const code = err?.errcode || err?.data?.errcode || '';
    let msg = err?.message || 'Не удалось войти.';
    if (code === 'M_FORBIDDEN') msg = 'Неверный Matrix ID или пароль.';
    if (code === 'M_USER_DEACTIVATED') msg = 'Этот аккаунт деактивирован.';
    if (/fetch|network|Failed/i.test(msg)) msg = 'Не удалось подключиться к homeserver. Проверьте адрес и CORS.';
    setAuthError(msg);
  } finally {
    setLoginLoading(false);
  }
}

async function restoreSession(session) {
  setLoginLoading(true, 'Войти');
  $('.btn-label', $('#login-btn')).textContent = 'Восстанавливаем сессию…';
  try {
    if (!session.deviceId) {
      clearSession();
      showAuth();
      setAuthError('Сессия устарела: войдите заново, чтобы включить E2EE.');
      return;
    }
    const client = matrixcs.createClient({
      baseUrl: session.baseUrl,
      userId: session.userId,
      accessToken: session.accessToken,
      deviceId: session.deviceId,
    });
    state.userId = session.userId;
    attachClient(client);
    await prepareCrypto(client);
    const ready = waitForPrepared(client);
    client.startClient({ initialSyncLimit: 40, lazyLoadMembers: true, threadSupport: true });
    await ready;
    await finishLogin();
  } catch (err) {
    console.warn('Session restore failed', err);
    clearSession();
    try { state.client?.stopClient(); } catch {}
    state.client = null;
    setAuthError('Сессия истекла. Войдите снова.');
  } finally {
    setLoginLoading(false);
    const label = $('.btn-label', $('#login-btn'));
    if (label) label.textContent = 'Войти';
  }
}

async function finishLogin() {
  document.body.classList.remove('auth-mode');
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  await refreshProfile();
  updateCallButtons();
  state.client.getRooms().forEach(watchTypingMembers);
  renderRooms();
  const rooms = state.client.getRooms();
  if (rooms.length && !state.currentRoomId) {
    // Do not auto-join a room visually, keep the welcome screen.
  }
}

/* ════════════════════════════════════════════════════════════
   Client listeners
   ════════════════════════════════════════════════════════════ */
function updateTypingForRoom(room) {
  if (!room) return;
  const ids = (room.getMembers?.() || [])
    .filter((member) => member.typing && member.userId !== state.userId)
    .map((member) => member.userId);
  state.typing[room.roomId] = ids;
  if (room.roomId === state.currentRoomId) renderTyping();
  scheduleRooms();
}

function watchTypingMembers(room) {
  if (!room) return;
  const members = room.getMembers?.() || room.getJoinedMembers?.() || [];
  for (const member of members) {
    if (watchedTypingMembers.has(member)) continue;
    watchedTypingMembers.add(member);
    member.on?.('RoomMember.typing', () => updateTypingForRoom(room));
  }
}

function watchEventUpdates(event, room) {
  if (!event?.once) return;
  const refresh = () => {
    if (room.roomId === state.currentRoomId) scheduleMessages(false);
    scheduleRooms();
  };
  event.once('Event.decrypted', refresh);
  event.once('Event.replaced', refresh);
}

function attachClient(client) {
  state.client = client;

  client.on('Room.timeline', (event, room, toStartOfTimeline) => {
    if (!room) return;
    const type = event.getType();

    if (type === 'm.typing') {
      const ids = (event.getContent().user_ids || []).filter((id) => id !== state.userId);
      state.typing[room.roomId] = ids;
      if (room.roomId === state.currentRoomId) renderTyping();
      scheduleRooms();
      return;
    }

    if (type === 'm.room.message' || type === 'm.room.encrypted' || type === 'm.reaction' || type === 'm.sticker' || type === 'm.poll.start' || type === 'm.poll.response' || type === 'm.poll.end' || type === 'org.matrix.msc3381.poll.start' || type === 'org.matrix.msc3381.poll.response' || type === 'org.matrix.msc3381.poll.end') {
      if (type === 'm.room.message' || type === 'm.room.encrypted') watchEventUpdates(event, room);
      if (room.roomId === state.currentRoomId && !toStartOfTimeline) {
        scheduleMessages(false);
      }
      scheduleRooms();

      if (!toStartOfTimeline && type !== 'm.reaction') {
        const sender = event.getSender();
        const isNew = Date.now() - event.getTs() < 15000;
        if (isNew && sender !== state.userId) {
          notifyNewMessage(room, event);
        }
        if (room.roomId === state.currentRoomId) {
          scheduleReadReceipt(room);
        }
      }
    }
  });

  client.on('Room', (room) => { watchTypingMembers(room); updateTypingForRoom(room); scheduleRooms(); });
  client.on('Room.redaction', (event, room) => {
    if (room?.roomId === state.currentRoomId) scheduleMessages(false);
    scheduleRooms();
  });
  client.on('Room.myMembership', () => scheduleRooms());
  client.on('RoomState.events', (event, roomState) => {
    const room = roomState?.roomId ? client.getRoom(roomState.roomId) : null;
    if (room) watchTypingMembers(room);
    if (roomState?.roomId === state.currentRoomId) renderRoomHeader();
    scheduleRooms();
  });
  client.on('sync', (syncState) => {
    if (syncState === 'PREPARED' || syncState === 'SYNCING') {
      scheduleRooms();
      if (state.currentRoomId) scheduleMessages(false);
    }
    if (syncState === 'ERROR') {
      console.warn('Matrix sync error');
    }
  });
  client.on('Call.incoming', (call) => onIncomingCall(call));
  client.on('crypto.verificationRequestReceived', (request) => {
    toast(`Запрос на проверку от ${request?.otherUserId || 'пользователя'}`, 'info', 8000);
    openVerifyModal(request, request?.otherUserId || 'пользователь', request?.otherDeviceId || null);
    if (request && !request.initiatedByMe) {
      setVerifyBody(`
        <div class="verify-wait"><p><strong>${escapeHtml(request.otherUserId || '')}</strong> хочет проверить устройство.<br><small>${escapeHtml(request.otherDeviceId || '')}</small></p></div>
        <div class="modal-actions"><button class="btn btn-primary" id="verify-accept">Принять</button><button class="btn btn-ghost" id="verify-reject">Отклонить</button></div>`);
      $('#verify-accept').addEventListener('click', () => {
        request.accept().catch((err) => toast(err?.message || 'Ошибка', 'error'));
        renderVerifyUI();
      });
      $('#verify-reject').addEventListener('click', cancelVerification);
    }
  });
  client.on('Session.logged_out', () => {
    clearSession();
    showAuth();
    toast('Сессия завершена', 'info');
  });
}

async function refreshProfile() {
  if (!state.client) return;
  const userId = state.client.getUserId();
  const user = state.client.getUser(userId);
  let profile = null;

  try { profile = await state.client.getProfileInfo(userId); } catch {}

  state.profile = {
    displayName:
      profile?.displayname ||
      user?.displayName ||
      userId?.replace(/^@/, '').split(':')[0] ||
      'Вы',
    avatarUrl: profile?.avatar_url || user?.avatarUrl || null,
  };

  const name = state.profile.displayName;
  $('#my-name').textContent = name;
  $('#my-id').textContent = userId || '';
  $('#my-avatar').outerHTML = avatarHtml(name, state.profile.avatarUrl, 'avatar-36').replace(
    '<span class="avatar avatar-36"',
    '<span id="my-avatar" class="avatar avatar-36"'
  );
  $('#settings-name').textContent = name;
  $('#settings-id').textContent = userId || '';
  const settingsAvatar = $('#settings-avatar');
  if (settingsAvatar) settingsAvatar.outerHTML = avatarHtml(name, state.profile.avatarUrl, 'avatar-56').replace(
    '<span class="avatar avatar-56"',
    '<span id="settings-avatar" class="avatar avatar-56"'
  );
  const input = $('#display-name');
  if (input && document.activeElement !== input) input.value = name;
}

/* ════════════════════════════════════════════════════════════
   Room rendering
   ════════════════════════════════════════════════════════════ */
const scheduleRooms = debounce(renderRooms, 50);
const scheduleMessages = debounce((force) => renderMessages(force), 50);

function roomName(room) {
  return room?.name || room?.getDefaultDisplayName?.() || room?.getCanonicalAlias?.() || room?.roomId || 'Комната';
}

function roomAvatarMxc(room) {
  try {
    return room.getAvatarUrl(state.client.getHomeserverUrl(), 96, 96, 'crop') || null;
  } catch {
    return null;
  }
}

function roomPreview(room) {
  const events = room.timeline || [];
  const edits = new Map();
  for (const ev of events) {
    if (ev.getType() !== 'm.room.message') continue;
    const rel = ev.getContent()?.['m.relates_to'];
    if (rel?.rel_type === 'm.replace' && rel.event_id) {
      edits.set(rel.event_id, ev.getContent()?.['m.new_content'] || {});
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    const type = ev.getType();
    if (type === 'm.reaction') continue;
    const content = ev.getContent() || {};
    if (type === 'm.room.encrypted' && !content.msgtype) {
      return { text: 'Зашифрованное сообщение', ts: ev.getTs(), own: false };
    }
    if (type !== 'm.room.message' && type !== 'm.room.encrypted') continue;
    if (content['m.relates_to']?.rel_type === 'm.replace') continue;
    let text = edits.get(ev.getId())?.body || content.body || '';
    if (content['m.poll'] || content['org.matrix.msc3381.poll.start']) text = 'Опрос';
    else if (content.msgtype === 'm.image') text = 'Фото';
    else if (type === 'm.sticker' || content.msgtype === 'm.sticker') text = 'Стикер';
    else if (content.msgtype === 'm.file') text = 'Файл';
    else if (content.msgtype === 'm.audio') text = content['org.matrix.msc3245.voice'] || !content.body ? 'Голосовое сообщение' : 'Аудио';
    else if (content.msgtype === 'm.video') text = 'Видео';
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) text = 'Сообщение';
    if (text.length > 90) text = text.slice(0, 90) + '…';
    return { text, ts: ev.getTs(), own: ev.getSender() === state.userId };
  }
  return { text: 'Нет сообщений', ts: room.getLastActiveTimestamp?.() || 0, own: false };
}

function unreadFor(room) {
  try {
    const total = room.getUnreadNotificationCount?.('total') || 0;
    const highlight = room.getUnreadNotificationCount?.('highlight') || 0;
    return { total, highlight };
  } catch {
    return { total: 0, highlight: 0 };
  }
}

function renderRooms() {
  if (!state.client && !state.demo) return;
  const list = $('#room-list');
  if (!list) return;

  renderSpaces();
  renderInvites();

  let rooms;
  if (state.demo) {
    rooms = state.demoRooms;
  } else {
    rooms = clientRooms()
      .filter((room) => room.getMyMembership?.() !== 'invite')
      .slice()
      .sort((a, b) => {
        return (b.getLastActiveTimestamp?.() || 0) - (a.getLastActiveTimestamp?.() || 0);
      });
  }

  const filter = state.roomFilter.trim().toLowerCase();
  const visible = rooms.filter((room) => {
    const name = state.demo ? room.name : roomName(room);
    return !filter || name.toLowerCase().includes(filter) || (!state.demo && room.roomId.toLowerCase().includes(filter));
  });

  $('#room-count').textContent = String(rooms.length);

  const totalUnread = rooms.reduce((sum, room) => {
    if (state.demo) return sum + (room.unread || 0);
    return sum + (unreadFor(room).total || 0);
  }, 0);
  document.title = totalUnread ? `(${totalUnread}) mst.matrix` : 'mst.matrix — Matrix, beautifully';

  const empty = $('#rooms-empty');
  empty.classList.toggle('hidden', visible.length !== 0);
  if (visible.length === 0) {
    const label = empty.querySelector('p');
    const action = $('#empty-new-room');
    if (label) label.textContent = rooms.length ? 'Ничего не найдено' : 'Пока нет комнат';
    if (action) action.textContent = rooms.length ? 'Сбросить поиск' : 'Создать комнату';
  }

  if (!visible.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = visible
    .map((room) => {
      let id, name, avatar, preview, time, unread, typing;
      if (state.demo) {
        id = room.id;
        name = room.name;
        avatar = avatarHtml(name, null, '');
        const last = room.messages[room.messages.length - 1];
        preview = last ? last.body.replace(/\s+/g, ' ').slice(0, 90) : 'Нет сообщений';
        time = last ? formatListTime(last.ts) : '';
        unread = { total: room.unread || 0, highlight: room.unread ? 1 : 0 };
        typing = false;
      } else {
        id = room.roomId;
        name = roomName(room);
        avatar = avatarHtml(name, roomAvatarMxc(room), '');
        const p = roomPreview(room);
        preview = p.own ? `Вы: ${p.text}` : p.text;
        time = formatListTime(p.ts);
        unread = unreadFor(room);
        typing = (state.typing[room.roomId] || []).length > 0;
      }

      if (typing) preview = '<span class="typing-preview">печатает…</span>';
      else if (state.drafts[id] && id !== state.currentRoomId) preview = `<span class="draft-preview">Черновик: ${escapeHtml(state.drafts[id].replace(/\s+/g, ' ').slice(0, 70))}</span>`;
      else preview = escapeHtml(preview);
      const active = id === state.currentRoomId ? 'active' : '';
      return `
        <button class="room-item ${active}" data-room-id="${escapeAttr(id)}" title="${escapeAttr(name)}">
          ${avatar}
          <span class="room-item-main">
            <span class="room-item-top">
              <span class="room-item-name">${escapeHtml(name)}</span>
              <span class="room-item-time">${escapeHtml(time)}</span>
            </span>
            <span class="room-item-preview">${preview}</span>
          </span>
          <span class="room-item-side">
            ${unread.total ? `<span class="unread-badge">${unread.total > 99 ? '99+' : unread.total}</span>` : ''}
            ${!unread.total && unread.highlight ? '<span class="mention-badge"></span>' : ''}
          </span>
        </button>`;
    })
    .join('');
}

function renderRoomHeader() {
  const room = getCurrentRoom();
  if (!room) return;
  if (state.demo) {
    $('#room-name').textContent = room.name;
    $('#room-sub').textContent = `${room.members.length} участников · ${room.topic}`;
    const av = $('#room-avatar');
    if (av) av.outerHTML = avatarHtml(room.name, null, 'avatar-42').replace(
      '<span class="avatar avatar-42"',
      '<span id="room-avatar" class="avatar avatar-42"'
    );
    renderPinnedBar();
    return;
  }

  const name = roomName(room);
  const topic = room.getTopic?.() || '';
  const count = room.getJoinedMemberCount?.() || 0;
  $('#room-name').textContent = name;
  $('#room-sub').textContent = [count ? `${count} участников` : '', topic].filter(Boolean).join(' · ') || 'Комната Matrix';
  const av = $('#room-avatar');
  if (av) {
    av.outerHTML = avatarHtml(name, roomAvatarMxc(room), 'avatar-42').replace(
      '<span class="avatar avatar-42"',
      '<span id="room-avatar" class="avatar avatar-42"'
    );
  }
  renderPinnedBar();
  updateCallButtons();
}

function updateCallButtons() {
  const room = getCurrentRoom();
  const voip = !state.demo && state.client?.supportsVoip?.() !== false;
  const oneToOne = !state.demo && (room?.getJoinedMemberCount?.() || 0) <= 2;
  const show = voip && oneToOne;
  $('#call-voice-btn')?.classList.toggle('hidden', !show);
  $('#call-video-btn')?.classList.toggle('hidden', !show);
}

function selectRoom(roomId) {
  if (!state.demo) {
    const target = state.client?.getRoom(roomId);
    const membership = target?.getMyMembership?.();
    if (target && membership && membership !== 'join') {
      toast('Комната недоступна: сначала примите приглашение', 'info');
      return;
    }
  }
  state.replyingTo = null;
  renderReplyBanner();
  closeMentionPop();
  if (state.voice.recorder?.state === 'recording') finishVoiceRecording(false);
  $$('.msg.tools-open').forEach((m) => m.classList.remove('tools-open'));
  state.currentRoomId = roomId;
  if (state.demo) state.demoRoomId = roomId;
  state.messageFilter = '';
  $('#chat-search-bar').classList.add('hidden');
  $('#chat-search').value = '';
  $('#empty-state').classList.add('hidden');
  $('#chat-view').classList.remove('hidden');
  renderRoomHeader();
  updateCallButtons();
  renderMessages(true);
  renderRooms();
  closeSidebar();
  const room = getCurrentRoom();
  if (room && !state.demo) scheduleReadReceipt(room, true);
  const input = $('#message-input');
  if (input) {
    input.value = state.drafts[roomId] || '';
    resizeComposer();
    updateSendButton();
    input.focus();
  }
}

function showEmptyState() {
  state.currentRoomId = null;
  $('#chat-view').classList.add('hidden');
  $('#empty-state').classList.remove('hidden');
  renderRooms();
}

/* ════════════════════════════════════════════════════════════
   Message model
   ════════════════════════════════════════════════════════════ */
function clientRooms() {
  return (state.client?.getRooms() || []).filter(
    (room) => !room.isSpaceRoom?.() && room.getMyMembership?.() === 'join'
  );
}

function getCurrentRoom() {
  if (!state.currentRoomId) return null;
  if (state.demo) return state.demoRooms.find((r) => r.id === state.currentRoomId) || null;
  return state.client?.getRoom(state.currentRoomId) || null;
}

function buildTimeline(room) {
  if (state.demo) {
    const demoMessages = room.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      senderName: m.name,
      ts: m.ts,
      msgtype: m.msgtype || (m.content?.['m.poll'] ? 'm.poll' : 'm.text'),
      body: m.body,
      content: m.content || { msgtype: m.msgtype || 'm.text', body: m.body },
      own: !!m.isOwn,
      redacted: false,
      edited: !!m.edited,
      reactions: m.reactions || {},
      poll: m.poll
        ? { responses: m.pollResponses || [], ended: !!m.pollEnded }
        : undefined,
      encrypted: false,
    }));
    const demoById = new Map(demoMessages.map((m) => [m.id, m]));
    for (const m of demoMessages) {
      const replyId = m.content?.['m.relates_to']?.['m.in_reply_to']?.event_id;
      const target = replyId ? demoById.get(replyId) : null;
      if (target) {
        m.replyTo = {
          id: replyId,
          name: target.own ? 'Вы' : target.senderName,
          body: messageLabel(target).replace(/\s+/g, ' ').slice(0, 140),
        };
      }
    }
    return demoMessages;
  }

  const events = room.timeline || [];
  const edits = new Map();
  const reactionMap = new Map(); // targetId -> Map<key, {count, mine, eventId}>
  const pollResponses = new Map(); // targetId -> {sender, selections, eventId}[]
  const pollEnded = new Set();

  for (const ev of events) {
    const type = ev.getType();
    if (type === 'm.poll.response' || type === 'org.matrix.msc3381.poll.response') {
      const rel = ev.getContent()?.['m.relates_to'];
      const target = rel?.event_id;
      if (target) {
        if (!pollResponses.has(target)) pollResponses.set(target, []);
        pollResponses.get(target).push({
          sender: ev.getSender(),
          selections: ev.getContent()?.['m.selections'] || ev.getContent()?.['org.matrix.msc3381.v2.selections'] || [],
          eventId: ev.getId(),
        });
      }
      continue;
    }
    if (type === 'm.poll.end' || type === 'org.matrix.msc3381.poll.end') {
      const rel = ev.getContent()?.['m.relates_to'];
      if (rel?.event_id) pollEnded.add(rel.event_id);
      continue;
    }
    if (type === 'm.room.message') {
      const rel = ev.getContent()?.['m.relates_to'];
      if (rel?.rel_type === 'm.replace' && rel.event_id) {
        const edited = ev.getContent()['m.new_content'] || ev.getContent();
        edits.set(rel.event_id, edited);
      }
    } else if (type === 'm.reaction') {
      const rel = ev.getContent()?.['m.relates_to'];
      if (rel?.rel_type === 'm.annotation' && rel.event_id) {
        if (!reactionMap.has(rel.event_id)) reactionMap.set(rel.event_id, new Map());
        const byKey = reactionMap.get(rel.event_id);
        const key = rel.key || '👍';
        const prev = byKey.get(key) || { count: 0, mine: false, eventId: null };
        prev.count += 1;
        if (ev.getSender() === state.userId) {
          prev.mine = true;
          prev.eventId = ev.getId();
        }
        byKey.set(key, prev);
      }
    }
  }

  const messages = [];
  for (const ev of events) {
    const type = ev.getType();
    if (type !== 'm.room.message' && type !== 'm.room.encrypted' && type !== 'm.sticker' && type !== 'm.poll.start' && type !== 'org.matrix.msc3381.poll.start') continue;
    const content = ev.getContent() || {};
    const rel = content['m.relates_to'];
    if (rel?.rel_type === 'm.replace') continue;
    if (type === 'm.room.message' && !content.msgtype && !ev.isRedacted?.()) continue;

    let finalContent = content;
    const edit = edits.get(ev.getId());
    if (edit) finalContent = { ...content, ...edit };

    const reactionObj = {};
    const rmap = reactionMap.get(ev.getId());
    if (rmap) {
      for (const [key, val] of rmap) reactionObj[key] = val;
    }

    const member = room.getMember?.(ev.getSender());
    messages.push({
      id: ev.getId(),
      sender: ev.getSender(),
      senderName: member?.name || ev.getSender(),
      ts: ev.getTs(),
      msgtype: finalContent.msgtype || (type === 'm.poll.start' || type === 'org.matrix.msc3381.poll.start' ? 'm.poll' : type === 'm.sticker' ? 'm.sticker' : type === 'm.room.encrypted' ? 'm.room.encrypted' : 'm.text'),
      body: finalContent.body || '',
      content: finalContent,
      own: ev.getSender() === state.userId,
      redacted: !!ev.isRedacted?.(),
      edited: !!edit,
      reactions: reactionObj,
      threadRoot: rel?.rel_type === 'm.thread' ? rel.event_id : null,
      poll: (type === 'm.poll.start' || type === 'org.matrix.msc3381.poll.start')
        ? { responses: pollResponses.get(ev.getId()) || [], ended: pollEnded.has(ev.getId()) }
        : undefined,
      encrypted: type === 'm.room.encrypted',
      decryptionFailure: type === 'm.room.encrypted' && (ev.isDecryptionFailure?.() ?? true),
    });
  }

  const byId = new Map(messages.map((m) => [m.id, m]));
  for (const msg of messages) {
    const replyId = msg.content?.['m.relates_to']?.['m.in_reply_to']?.event_id;
    if (!replyId) continue;
    const target = byId.get(replyId);
    if (target) {
      msg.replyTo = {
        id: replyId,
        name: target.own ? 'Вы' : target.senderName,
        body: messageLabel(target).replace(/\s+/g, ' ').slice(0, 140),
      };
    }
  }

  return messages;
}

function reactionChips(reactions, targetId) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return '';
  return `<div class="reactions">${entries
    .map(([key, val]) => {
      return `<button class="reaction ${val.mine ? 'mine' : ''}" data-action="reaction-toggle"
        data-target="${escapeAttr(targetId)}" data-key="${escapeAttr(key)}" data-event="${escapeAttr(val.eventId || '')}">
        <span>${escapeHtml(key)}</span><span class="count">${val.count}</span>
      </button>`;
    })
    .join('')}</div>`;
}

function fileCard(content, msg) {
  const name = content.body || 'Файл';
  const size = formatBytes(content.info?.size);
  const encrypted = !!content.file;
  return `<button type="button" class="file-card" data-file-event="${escapeAttr(msg.id)}">
    <span class="file-ico">${icon(encrypted ? 'lock' : 'file')}</span>
    <span class="file-meta"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(size)}${encrypted ? ' · зашифровано' : ''}</small></span>
    <span class="file-dl">${icon('download')}</span>
  </button>`;
}

function mediaPlaceholder(kind, msgId, label) {
  return `<div class="media-placeholder" data-${kind}-event="${escapeAttr(msgId)}">
    <span class="media-spinner"></span><span>${escapeHtml(label)}</span>
  </div>`;
}

function audioPlayerHtml(msg) {
  const c = msg.content || {};
  const hasMedia = !!attachmentMxc(c);
  const voice = !!(c['org.matrix.msc3245.voice'] || c['org.matrix.msc1767.audio']) || !c.body;
  const label = c.body && c.body !== 'Voice message' ? c.body : (voice ? 'Голосовое сообщение' : 'Аудио');
  const duration = c.info?.duration ? c.info.duration / 1000 : 0;
  let seed = 0;
  for (let i = 0; i < msg.id.length; i++) seed = (seed * 31 + msg.id.charCodeAt(i)) % 997;
  const bars = Array.from({ length: 34 }, (_, i) => {
    const h = 5 + ((seed + i * 13 + (i % 4) * 7) % 18);
    return `<i style="height:${h}px"></i>`;
  }).join('');
  return `<div class="audio-message ${hasMedia ? '' : 'audio-unavailable'}" data-audio-event="${escapeAttr(msg.id)}">
    <button type="button" class="audio-play" title="Воспроизвести" aria-label="Воспроизвести">${icon('play')}</button>
    <div class="audio-center">
      <div class="audio-wave">${bars}</div>
      <div class="audio-info">
        <span class="audio-label">${escapeHtml(label)}</span>
        <span class="audio-time">${duration ? formatDuration(duration) : '0:00'}</span>
      </div>
    </div>
    <button type="button" class="audio-speed" title="Скорость воспроизведения" aria-label="Скорость">1×</button>
    <button type="button" class="audio-download" data-audio-download title="Скачать аудио" aria-label="Скачать аудио">${icon('download')}</button>
  </div>`;
}

function pollHtml(msg) {
  const c = msg.content || {};
  const poll = c['m.poll'] || c['org.matrix.msc3381.poll.start'] || {};
  const answers = poll.answers || [];
  const question = typeof poll.question === 'string'
    ? poll.question
    : poll.question?.['m.text'] || poll.question?.['org.matrix.msc1767.text'] || 'Опрос';
  const responses = msg.poll?.responses || [];
  const ended = msg.poll?.ended || !!c['org.matrix.msc3381.poll.end'];
  // Only the latest response from each sender counts.
  const latestBySender = new Map();
  for (const r of responses) latestBySender.set(r.sender, r);
  const effective = [...latestBySender.values()];
  const myVote = effective.find((r) => r.sender === state.userId);
  const mySelections = new Set(myVote?.selections || []);
  const counts = new Map();
  let total = 0;
  for (const r of effective) {
    const unique = new Set(r.selections || []);
    for (const sel of unique) {
      counts.set(sel, (counts.get(sel) || 0) + 1);
      total += 1;
    }
  }
  const winner = Math.max(...([...counts.values(), 0]));
  return `
    <div class="poll">
      <div class="poll-question">${escapeHtml(question)}</div>
      <div class="poll-options">
        ${answers.map((a) => {
          const id = a.id;
          const count = counts.get(id) || 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const chosen = mySelections.has(id);
          const leading = count === winner && total > 0;
          return `
            <button type="button" class="poll-option ${chosen ? 'chosen' : ''} ${leading ? 'leading' : ''}" data-poll-vote="${escapeAttr(msg.id)}" data-answer="${escapeAttr(id)}" ${ended ? 'disabled' : ''}>
              <span class="poll-bar" style="width:${ended || chosen || myVote ? pct : 0}%"></span>
              <span class="poll-text">${escapeHtml(a['org.matrix.msc1767.text'] || a['m.text'] || a.text || id)}</span>
              <span class="poll-count">${count} · ${pct}%</span>
            </button>`;
        }).join('')}
      </div>
      <div class="poll-foot">
        <span>${total} голосов</span>
        ${ended ? '<span class="poll-ended">Завершён</span>' : msg.own ? `<button type="button" class="poll-end-btn" data-poll-end="${escapeAttr(msg.id)}">Завершить опрос</button>` : ''}
      </div>
    </div>`;
}

function messageBodyHtml(msg) {
  if (msg.redacted) return '<span class="msg-redacted">Сообщение удалено</span>';
  if (msg.encrypted && msg.decryptionFailure) {
    return `<span class="msg-redacted">🔒 Зашифрованное сообщение. Для расшифровки нужен ключ устройства.</span>
      <div style="margin-top:8px;"><button type="button" class="btn btn-soft btn-sm" data-action="open-security">Восстановить ключи</button></div>`;
  }

  const c = msg.content || {};
  const imageUrl = c.url ? mxcToUrl(c.url, 900, 900, 'scale') : '';

  if (msg.msgtype === 'm.image') {
    const caption = c.body && !/^image/i.test(c.body) && c.body !== 'image'
      ? `<div class="image-caption">${escapeHtml(c.body)}</div>`
      : '';
    if (c.file) return mediaPlaceholder('image', msg.id, 'Расшифровываем изображение…') + caption;
    if (imageUrl) {
      return `<img class="msg-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(c.body || 'Изображение')}" loading="lazy" data-action="lightbox" data-src="${escapeAttr(imageUrl)}" data-media-mxc="${escapeAttr(c.url || '')}" data-media-w="900" data-media-h="900" data-media-method="scale" />${caption}`;
    }
    return mediaPlaceholder('image', msg.id, 'Изображение недоступно');
  }

  if (msg.msgtype === 'm.sticker' || (msg.msgtype === 'm.image' && c['org.matrix.msc2545.sticker'])) {
    const stickerUrl = c.url ? mxcToUrl(c.url, 320, 320, 'scale') : '';
    if (stickerUrl) return `<img class="msg-image msg-sticker" src="${escapeAttr(stickerUrl)}" alt="${escapeAttr(c.body || 'Стикер')}" loading="lazy" data-action="lightbox" data-src="${escapeAttr(stickerUrl)}" />`;
  }
  if (msg.msgtype === 'm.file') return fileCard(c, msg);
  if (msg.msgtype === 'm.audio') return audioPlayerHtml(msg);

  if (msg.msgtype === 'm.video') {
    if (c.file) return mediaPlaceholder('video', msg.id, 'Расшифровываем видео…');
    const videoUrl = c.url ? mxcToUrl(c.url, 1280, 720, 'scale') : '';
    if (videoUrl) {
      return `<video controls preload="metadata" src="${escapeAttr(videoUrl)}" class="msg-video"></video>`;
    }
    return mediaPlaceholder('video', msg.id, 'Видео недоступно');
  }

  if (msg.msgtype === 'm.poll') return pollHtml(msg);
  if (msg.msgtype === 'm.emote') {
    return `<em>* ${escapeHtml(msg.senderName)} ${formatText(msg.body)}</em>`;
  }
  if (msg.msgtype === 'm.notice') {
    return `<span class="muted">${formatText(msg.body)}</span>`;
  }
  return formatTextWithMentions(msg.body || '', getCurrentRoom());
}

function readReceiptHtml(msg) {
  if (!msg.own || state.demo) return '';
  const room = getCurrentRoom();
  if (!room) return '';
  const event = room.findEventById?.(msg.id);
  if (!event) return '';
  if (['sending', 'queued', 'encrypting'].includes(event.status)) {
    return `<span class="read-mark pending" title="Отправляется…">${icon('clock')}</span>`;
  }
  if (['not_sent', 'cancelled'].includes(event.status)) {
    return `<span class="read-mark failed" title="Не отправлено">${icon('alert')}</span>`;
  }
  const receipts = room.getReceiptsForEvent?.(event) || [];
  const readers = receipts.filter((r) => r.userId !== state.userId && (r.type === 'm.read' || !r.type));
  if (readers.length) {
    return `<span class="read-mark read" title="Прочитано: ${readers.length}">${icon('check-check')}</span>`;
  }
  return `<span class="read-mark" title="Отправлено">${icon('check')}</span>`;
}

function hasThread(eventId) {
  if (!eventId || state.demo) return false;
  return (getCurrentRoom()?.getThread?.(eventId)?.length || 0) > 0;
}

function messageHtml(msg, grouped, opts = {}) {
  const own = msg.own;
  const name = own ? 'Вы' : msg.senderName || msg.sender;
  const saved = isBookmarked(msg.id);
  const withTools = opts.withTools !== false;
  const threadTarget = msg.threadRoot || (hasThread(msg.id) ? msg.id : null);
  const tools = withTools ? `
    <div class="msg-tools">
      <button class="icon-btn" data-action="reply" data-event="${escapeAttr(msg.id)}" title="Ответить">${icon('reply')}</button>
      <button class="icon-btn" data-action="react" data-event="${escapeAttr(msg.id)}" title="Реакция">${icon('smile')}</button>
      ${threadTarget ? `<button class="icon-btn" data-action="thread" data-event="${escapeAttr(threadTarget)}" title="Ветка">${icon('messages')}</button>` : ''}
      <button class="icon-btn ${saved ? 'is-saved' : ''}" data-action="bookmark" data-event="${escapeAttr(msg.id)}" title="${saved ? 'Убрать из сохранённых' : 'Сохранить'}">${icon(saved ? 'bookmark-filled' : 'bookmark')}</button>
      ${canPin(getCurrentRoom()) && !msg.redacted ? `<button class="icon-btn ${isPinned(msg.id) ? 'is-saved' : ''}" data-action="pin" data-event="${escapeAttr(msg.id)}" title="${isPinned(msg.id) ? 'Открепить' : 'Закрепить'}">${icon('pin')}</button>` : ''}
      ${own ? `<button class="icon-btn" data-action="edit" data-event="${escapeAttr(msg.id)}" title="Изменить">${icon('edit')}</button>` : ''}
      ${own ? `<button class="icon-btn" data-action="delete" data-event="${escapeAttr(msg.id)}" title="Удалить">${icon('trash')}</button>` : ''}
      <button class="icon-btn" data-action="copy" data-event="${escapeAttr(msg.id)}" title="Копировать">${icon('copy')}</button>
    </div>` : '';

  return `<div class="msg ${own ? 'own' : ''} ${grouped ? 'grouped' : ''}" data-event-id="${escapeAttr(msg.id)}">
    <div class="msg-avatar" data-user-id="${escapeAttr(msg.sender)}" title="Профиль" role="button" tabindex="0">${avatarHtml(msg.senderName || msg.sender)}</div>
    <div class="msg-main">
      <div class="msg-head">
        <span class="msg-sender" data-user-id="${escapeAttr(msg.sender)}" role="button" tabindex="0">${escapeHtml(name)}</span>
        ${msg.threadRoot ? `<button type="button" class="thread-tag" data-action="thread" data-event="${escapeAttr(msg.threadRoot)}">ветка</button>` : ''}
        <span class="msg-time">${formatTime(msg.ts)}${msg.edited ? ' · изм.' : ''}</span>
        ${readReceiptHtml(msg)}
      </div>
      <div class="bubble">
        ${msg.replyTo ? `<button type="button" class="reply-quote" data-action="jump-reply" data-event="${escapeAttr(msg.replyTo.id)}">
          <strong>${escapeHtml(msg.replyTo.name)}</strong><small>${escapeHtml(msg.replyTo.body)}</small>
        </button>` : ''}
        ${messageBodyHtml(msg)}
      </div>
      ${reactionChips(msg.reactions, msg.id)}
      ${tools}
    </div>
  </div>`;
}

async function loadOlderMessages() {
  if (state.demo || state.loadingOlder || !state.client || !state.currentRoomId) return;
  const room = state.client.getRoom(state.currentRoomId);
  const timeline = room?.getLiveTimeline?.();
  if (!timeline) return;
  const backwards = matrixcs.EventTimeline?.BACKWARDS || 'b';
  const token = timeline.getPaginationToken?.(backwards);
  if (!token) return;

  const scroll = $('#message-scroll');
  const oldHeight = scroll?.scrollHeight || 0;
  const oldTop = scroll?.scrollTop || 0;
  state.loadingOlder = true;
  try {
    await state.client.scrollback(room, 50);
    renderMessages(false);
    requestAnimationFrame(() => {
      if (!scroll) return;
      scroll.scrollTop = scroll.scrollHeight - oldHeight + oldTop;
    });
  } catch (err) {
    console.warn('Scrollback failed', err);
  } finally {
    state.loadingOlder = false;
  }
}

function renderMessages(forceBottom = false) {
  const room = getCurrentRoom();
  if (!room) return;

  const scroll = $('#message-scroll');
  const messagesEl = $('#messages');
  if (!scroll || !messagesEl) return;

  const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 140;
  const allMessages = buildTimeline(room);
  state.messageContent.clear();
  for (const m of allMessages) state.messageContent.set(m.id, m.content);
  let messages = allMessages;
  if (state.messageFilter) {
    const q = state.messageFilter.toLowerCase();
    messages = messages.filter((m) => `${m.body || ''} ${m.senderName || ''}`.toLowerCase().includes(q));
  }

  let html = '';
  let lastDate = '';
  let lastSender = null;
  let lastTs = 0;

  for (const msg of messages) {
    const date = new Date(msg.ts).toDateString();
    if (date !== lastDate) {
      html += `<div class="date-sep"><span>${formatDateLabel(msg.ts)}</span></div>`;
      lastDate = date;
      lastSender = null;
      lastTs = 0;
    }
    const grouped = lastSender === msg.sender && msg.ts - lastTs < 5 * 60 * 1000;
    html += messageHtml(msg, grouped);
    lastSender = msg.sender;
    lastTs = msg.ts;
  }

  if (!messages.length) {
    html = `<div class="msg-system">${state.messageFilter ? 'Ничего не найдено' : 'Пока нет сообщений. Напишите первым!'}</div>`;
  }

  messagesEl.innerHTML = html;
  hydrateMedia();

  if (forceBottom || nearBottom) {
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  if (!state.demo) {
    const last = [...(room.timeline || [])].reverse().find((e) => e.getType() === 'm.room.message' || e.getType() === 'm.room.encrypted');
    if (last) scheduleReadReceipt(room);
  }
}

/* ════════════════════════════════════════════════════════════
   Media hydration: encrypted images, video, audio
   ════════════════════════════════════════════════════════════ */
function hydrateMedia() {
  hydrateAudioPlayers();
  hydrateImageMessages();
  hydrateVideoMessages();
}

function hydrateImageMessages() {
  $$('.media-placeholder[data-image-event]').forEach(async (el) => {
    const id = el.dataset.imageEvent;
    const content = state.messageContent.get(id);
    if (!content) return;
    try {
      const url = await resolveAttachmentUrl(content);
      const img = document.createElement('img');
      img.className = 'msg-image';
      img.src = url;
      img.alt = content.body || 'Изображение';
      img.loading = 'lazy';
      img.dataset.action = 'lightbox';
      img.dataset.src = url;
      el.replaceWith(img);
    } catch (err) {
      console.warn('Image decrypt failed', err);
      el.classList.add('media-failed');
      el.innerHTML = `${icon('alert')}<span>Не удалось расшифровать изображение</span>`;
    }
  });
}

function hydrateVideoMessages() {
  $$('.media-placeholder[data-video-event]').forEach(async (el) => {
    const id = el.dataset.videoEvent;
    const content = state.messageContent.get(id);
    if (!content) return;
    try {
      const url = await resolveAttachmentUrl(content);
      const video = document.createElement('video');
      video.className = 'msg-video';
      video.controls = true;
      video.preload = 'metadata';
      video.src = url;
      el.replaceWith(video);
    } catch (err) {
      console.warn('Video decrypt failed', err);
      el.classList.add('media-failed');
      el.innerHTML = `${icon('alert')}<span>Не удалось расшифровать видео</span>`;
    }
  });
}

function hydrateAudioPlayers() {
  $$('.audio-message[data-audio-event]').forEach(async (el) => {
    if (el.dataset.audioReady === '1' || el.dataset.audioReady === 'loading') return;
    el.dataset.audioReady = 'loading';
    const id = el.dataset.audioEvent;
    const content = state.messageContent.get(id);
    if (!content) {
      el.dataset.audioReady = 'error';
      return;
    }

    const playBtn = el.querySelector('.audio-play');
    const timeEl = el.querySelector('.audio-time');
    const wave = el.querySelector('.audio-wave');
    const bars = [...el.querySelectorAll('.audio-wave i')];
    const hintDuration = content.info?.duration ? content.info.duration / 1000 : 0;

    try {
      const url = await resolveAttachmentUrl(content);
      const audio = document.createElement('audio');
      audio.preload = 'metadata';
      audio.src = url;
      audio.style.display = 'none';
      el.appendChild(audio);

      const setProgress = () => {
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : hintDuration;
        if (duration > 0) {
          const progress = Math.min(1, audio.currentTime / duration);
          bars.forEach((bar, i) => bar.classList.toggle('passed', i / bars.length <= progress));
          timeEl.textContent = formatDuration(audio.currentTime);
        }
      };

      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          timeEl.textContent = formatDuration(audio.duration);
        }
        el.classList.add('audio-ready');
      });
      audio.addEventListener('timeupdate', setProgress);
      audio.addEventListener('play', () => {
        setIcon(playBtn, 'pause');
        el.classList.add('playing');
      });
      audio.addEventListener('pause', () => {
        setIcon(playBtn, 'play');
        el.classList.remove('playing');
      });
      audio.addEventListener('ended', () => {
        setIcon(playBtn, 'play');
        el.classList.remove('playing');
        audio.currentTime = 0;
        bars.forEach((bar) => bar.classList.remove('passed'));
        timeEl.textContent = hintDuration ? formatDuration(hintDuration) : '0:00';
      });
      audio.addEventListener('error', () => {
        el.dataset.audioReady = 'error';
        el.classList.add('audio-unavailable');
        timeEl.textContent = 'недоступно';
      });

      playBtn.addEventListener('click', () => {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      });

      if (wave) {
        wave.style.cursor = 'pointer';
        wave.addEventListener('click', (e) => {
          const rect = wave.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          const duration = audio.duration || hintDuration;
          if (duration > 0) audio.currentTime = ratio * duration;
        });
      }

      const speedBtn = el.querySelector('.audio-speed');
      if (speedBtn) {
        speedBtn.addEventListener('click', () => {
          const rates = [1, 1.5, 2];
          const idx = rates.indexOf(audio.playbackRate);
          audio.playbackRate = rates[(idx + 1) % rates.length];
          speedBtn.textContent = `${audio.playbackRate}×`;
        });
      }

      if (hintDuration) timeEl.textContent = formatDuration(hintDuration);
      el.dataset.audioReady = '1';
      el.classList.add('audio-ready');
    } catch (err) {
      console.warn('Audio load failed', err);
      el.dataset.audioReady = 'error';
      el.classList.add('audio-unavailable');
      if (timeEl) timeEl.textContent = 'недоступно';
      if (playBtn) playBtn.disabled = true;
      if (wave) wave.classList.add('wave-failed');
    }
  });
}

/* ════════════════════════════════════════════════════════════
   Typing & receipts
   ════════════════════════════════════════════════════════════ */
function renderTyping() {
  const el = $('#typing');
  if (!el) return;
  const ids = state.typing[state.currentRoomId] || [];
  if (!ids.length) {
    el.innerHTML = '';
    return;
  }
  const names = ids.map((id) => {
    const room = getCurrentRoom();
    if (state.demo) return 'Кто-то';
    return room?.getMember?.(id)?.name || id;
  });
  el.innerHTML = `${escapeHtml(names.join(', '))} печатает<span class="dots"><i></i><i></i><i></i></span>`;
}

function scheduleReadReceipt(room, immediate = false) {
  if (!room || state.demo || !state.client) return;
  const roomId = room.roomId;
  const send = () => {
    if (!state.client) return;
    const events = (room.timeline || []).filter((e) => e.getType() === 'm.room.message' || e.getType() === 'm.room.encrypted');
    const last = events[events.length - 1];
    if (!last) return;
    state.client.sendReadReceipt(last).catch(() => {});
  };
  if (immediate) {
    send();
    return;
  }
  clearTimeout(state.readReceiptTimers[roomId]);
  state.readReceiptTimers[roomId] = setTimeout(send, 800);
}

/* ════════════════════════════════════════════════════════════
   Authenticated media fallback
   ════════════════════════════════════════════════════════════ */
const authMediaCache = new Map();

async function loadAuthenticatedMedia(img) {
  if (!img || !state.client || state.demo) return;
  const mxc = img.dataset.mediaMxc || img.dataset.avatarMxc;
  if (!mxc || img.dataset.authLoading === '1') return;
  img.dataset.authLoading = '1';

  const w = Number(img.dataset.mediaW) || 96;
  const h = Number(img.dataset.mediaH) || 96;
  const method = img.dataset.mediaMethod || 'scale';
  const key = `${mxc}|${w}|${h}|${method}`;
  if (authMediaCache.has(key)) {
    img.src = authMediaCache.get(key);
    return;
  }

  try {
    const url = state.client.mxcUrlToHttp(mxc, w, h, method, true, true, true);
    if (!url) throw new Error('No authenticated media URL');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${state.client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`Media HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    authMediaCache.set(key, objectUrl);
    img.src = objectUrl;
  } catch (err) {
    console.warn('Authenticated media failed', err);
    if (img.dataset.avatarFallback) {
      const fallback = img.dataset.avatarFallback;
      const parent = img.parentElement;
      if (parent) {
        img.remove();
        parent.textContent = fallback;
      }
    }
  }
}

/* ════════════════════════════════════════════════════════════
   Notifications
   ════════════════════════════════════════════════════════════ */
function notifyNewMessage(room, event) {
  if (document.hasFocus() && room.roomId === state.currentRoomId) return;
  const level = roomNotifLevel(room.roomId);
  if (level === 'mute') return;
  if (level === 'mention') {
    const highlight = event.getPushActions?.()?.tweaks?.highlight;
    if (!highlight) return;
  }

  const sender = room.getMember?.(event.getSender())?.name || event.getSender();
  let body = event.getContent()?.body || 'Новое сообщение';
  if (event.getType() === 'm.room.encrypted') body = 'Зашифрованное сообщение';
  if (event.getContent()?.msgtype === 'm.image') body = 'Фото';
  if (event.getContent()?.msgtype === 'm.file') body = 'Файл';

  if (state.prefs.sound) playBeep();

  if (state.prefs.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`${sender} · ${roomName(room)}`, {
        body: String(body).slice(0, 160),
        tag: event.getId(),
        silent: true,
      });
      n.onclick = () => {
        window.focus();
        selectRoom(room.roomId);
        n.close();
      };
    } catch {}
  }
}

let audioContext = null;
function playBeep() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   Sending
   ════════════════════════════════════════════════════════════ */
let typingSent = false;
let typingStopTimer = null;

function sendTypingState() {
  const roomId = state.currentRoomId;
  if (!roomId || state.demo || !state.client) return;
  if (!typingSent) {
    typingSent = true;
    state.client.sendTyping(roomId, true, 30000).catch(() => {});
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(stopTypingState, 4500);
}

function stopTypingState() {
  clearTimeout(typingStopTimer);
  if (!typingSent || !state.currentRoomId || state.demo || !state.client) {
    typingSent = false;
    return;
  }
  typingSent = false;
  state.client.sendTyping(state.currentRoomId, false, 0).catch(() => {});
}

function resizeComposer() {
  const ta = $('#message-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  updateSendButton();
}

function updateSendButton() {
  const ta = $('#message-input');
  const btn = $('#send-btn');
  if (!ta || !btn) return;
  btn.disabled = !ta.value.trim() && state.pendingFiles.length === 0;
}

function roomIsEncrypted(roomId) {
  try {
    const room = state.client?.getRoom(roomId);
    return !!(state.client?.isRoomEncrypted?.(roomId) || room?.hasEncryptionStateEvent?.());
  } catch {
    return false;
  }
}

async function sendAttachment(file, msgtype, extra = {}, roomIdArg = null) {
  const roomId = roomIdArg || state.currentRoomId;
  if (!roomId) throw new Error('Не выбрана комната');
  const encryptedRoom = roomIsEncrypted(roomId);
  let uploadSource = file;
  let fileInfo = null;

  if (encryptedRoom) {
    if (!state.client.getCrypto?.()) throw new Error('Шифрование комнаты недоступно на этом устройстве');
    const plaintext = await file.arrayBuffer();
    const encrypted = await encryptAttachment(plaintext);
    fileInfo = encrypted.info;
    uploadSource = new Blob([encrypted.data], { type: 'application/octet-stream' });
  }

  const upload = await state.client.uploadContent(uploadSource, {
    name: encryptedRoom ? undefined : file.name,
    type: encryptedRoom ? 'application/octet-stream' : (file.type || 'application/octet-stream'),
    includeFilename: !encryptedRoom,
  });
  const mxc = upload?.content_uri || upload;
  const info = {
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
    ...(extra.info || {}),
  };

  if (msgtype === 'm.image') {
    const dims = await imageSize(file).catch(() => null);
    if (dims) Object.assign(info, { w: dims.w, h: dims.h });
  }

  const content = {
    msgtype,
    body: extra.body || file.name,
    info,
  };

  if (fileInfo) {
    fileInfo.url = mxc;
    content.file = fileInfo;
  } else {
    content.url = mxc;
  }

  if (extra.voice) content['org.matrix.msc3245.voice'] = {};
  if (extra.relation) content['m.relates_to'] = extra.relation;

  await state.client.sendEvent(roomId, 'm.room.message', content);
  return content;
}

async function sendMessage() {
  const input = $('#message-input');
  const text = input.value.trim();
  const files = [...state.pendingFiles];
  if (!text && !files.length) return;
  if (!state.currentRoomId) return;

  const targetRoomId = state.currentRoomId;
  const replyId = state.replyingTo?.roomId === targetRoomId ? state.replyingTo.id : null;
  state.replyingTo = null;
  renderReplyBanner();

  input.value = '';
  delete state.drafts[targetRoomId];
  saveDrafts();
  resizeComposer();
  state.pendingFiles = [];
  renderFilePreview();
  updateSendButton();
  stopTypingState();

  if (state.demo) {
    const room = state.demoRooms.find((r) => r.id === targetRoomId);
    if (!room) return;
    const demoContent = { msgtype: 'm.text', body: text };
    if (replyId) demoContent['m.relates_to'] = { 'm.in_reply_to': { event_id: replyId } };
    room.messages.push({
      id: `demo-${Date.now()}`,
      sender: '@you:matrix.org',
      name: state.profile.displayName || 'Вы',
      ts: Date.now(),
      body: text || files.map((f) => f.name).join(', '),
      msgtype: 'm.text',
      isOwn: true,
      reactions: {},
      content: demoContent,
    });
    renderMessages(true);
    renderRooms();
    return;
  }

  try {
    if (text) {
      const content = { msgtype: 'm.text', body: text };
      if (replyId) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyId } };
      await state.client.sendEvent(targetRoomId, 'm.room.message', content);
    }

    for (const file of files) {
      const mime = file.type || 'application/octet-stream';
      let msgtype = 'm.file';
      if (mime.startsWith('image/')) msgtype = 'm.image';
      else if (mime.startsWith('audio/')) msgtype = 'm.audio';
      else if (mime.startsWith('video/')) msgtype = 'm.video';
      await sendAttachment(file, msgtype, { body: file.name }, targetRoomId);
    }

    renderMessages(true);
  } catch (err) {
    console.error(err);
    toast(`Не удалось отправить: ${err?.message || 'ошибка'}`, 'error');
    input.value = text;
    resizeComposer();
  }
}

function voiceSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function showVoiceUI() {
  const bar = $('#voice-recording');
  if (bar) bar.classList.remove('hidden');
  document.body.classList.add('voice-active');
  $('#voice-btn')?.classList.add('recording');
  $('.composer')?.classList.add('recording');
}

function hideVoiceUI() {
  const bar = $('#voice-recording');
  if (bar) bar.classList.add('hidden');
  document.body.classList.remove('voice-active');
  $('#voice-btn')?.classList.remove('recording');
  $('.composer')?.classList.remove('recording');
  setIcon($('#voice-btn'), 'mic');
}

async function toggleVoiceRecording() {
  if (!state.currentRoomId) {
    toast('Сначала выберите чат', 'info');
    return;
  }
  if (!voiceSupported()) {
    toast('Запись голоса не поддерживается этим браузером', 'error');
    return;
  }
  if (state.voice.recorder && state.voice.recorder.state === 'recording') {
    finishVoiceRecording(true);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    let mime = '';
    for (const candidate of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(candidate)) { mime = candidate; break; }
      } catch {}
    }
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const session = {
      recorder,
      stream,
      chunks: [],
      startTs: Date.now(),
      timer: null,
      cancel: false,
    };
    state.voice = session;

    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size) session.chunks.push(e.data);
    });

    recorder.addEventListener('stop', async () => {
      clearInterval(session.timer);
      session.stream.getTracks().forEach((track) => track.stop());
      const duration = Date.now() - session.startTs;
      const blob = new Blob(session.chunks, { type: recorder.mimeType || 'audio/webm' });
      const cancelled = session.cancel;
      state.voice = { recorder: null, stream: null, chunks: [], startTs: 0, timer: null, cancel: false };
      hideVoiceUI();
      if (cancelled || !blob.size || duration < 300) return;
      await sendVoiceMessage(blob, duration);
    });

    recorder.start(250);
    showVoiceUI();
    setIcon($('#voice-btn'), 'mic-off');
    session.timer = setInterval(() => {
      const timer = $('#voice-timer');
      if (timer) timer.textContent = formatDuration((Date.now() - session.startTs) / 1000);
    }, 250);
    const timer = $('#voice-timer');
    if (timer) timer.textContent = '0:00';
  } catch (err) {
    console.warn('Microphone error', err);
    toast('Не удалось получить доступ к микрофону', 'error');
    state.voice = { recorder: null, stream: null, chunks: [], startTs: 0, timer: null, cancel: false };
    hideVoiceUI();
  }
}

function finishVoiceRecording(send = true) {
  const recorder = state.voice.recorder;
  if (!recorder) return;
  state.voice.cancel = !send;
  try {
    recorder.stop();
  } catch {
    hideVoiceUI();
  }
}

async function sendVoiceMessage(blob, duration) {
  if (!state.currentRoomId) return;
  const targetRoomId = state.currentRoomId;
  const mime = blob.type || 'audio/webm';
  const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });

  if (state.demo) {
    const room = state.demoRooms.find((r) => r.id === targetRoomId);
    if (!room) return;
    const url = URL.createObjectURL(blob);
    room.messages.push({
      id: `demo-voice-${Date.now()}`,
      sender: '@you:matrix.org',
      name: state.profile.displayName || 'Вы',
      ts: Date.now(),
      body: 'Голосовое сообщение',
      msgtype: 'm.audio',
      isOwn: true,
      reactions: {},
      content: {
        msgtype: 'm.audio',
        body: 'Голосовое сообщение',
        url,
        info: { mimetype: mime, size: blob.size, duration },
        'org.matrix.msc3245.voice': {},
      },
    });
    renderMessages(true);
    renderRooms();
    return;
  }

  try {
    await sendAttachment(file, 'm.audio', {
      body: 'Голосовое сообщение',
      voice: true,
      info: { duration },
    }, targetRoomId);
    renderMessages(true);
  } catch (err) {
    console.error(err);
    toast('Не удалось отправить голосовое сообщение', 'error');
  }
}

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function renderFilePreview() {
  const el = $('#file-preview');
  if (!el) return;
  el.innerHTML = state.pendingFiles
    .map(
      (f, i) => `<span class="file-chip">${icon('paperclip')}<span>${escapeHtml(f.name)}</span><button class="icon-btn" data-remove-file="${i}" style="width:24px;height:24px;">${icon('x')}</button></span>`
    )
    .join('');
}

function renderReplyBanner() {
  const el = $('#reply-banner');
  if (!el) return;
  if (!state.replyingTo) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <span class="reply-ico">${icon('reply')}</span>
    <span class="reply-content">
      <strong>${escapeHtml(state.replyingTo.name)}</strong>
      <small>${escapeHtml((state.replyingTo.body || '').slice(0, 120))}</small>
    </span>
    <button class="icon-btn" id="reply-cancel" aria-label="Отменить ответ">${icon('x')}</button>`;
  $('#reply-cancel')?.addEventListener('click', () => {
    state.replyingTo = null;
    renderReplyBanner();
  });
}

/* ════════════════════════════════════════════════════════════
   Message actions
   ════════════════════════════════════════════════════════════ */
function findMessage(eventId) {
  const room = getCurrentRoom();
  if (!room) return null;
  return buildTimeline(room).find((m) => m.id === eventId) || null;
}

function isBookmarked(eventId) {
  return state.bookmarks.some((b) => b.id === eventId && b.roomId === state.currentRoomId);
}

function pinnedIds(room) {
  if (state.demo) return room?.pinned || [];
  const ev = room?.currentState?.getStateEvents?.('m.room.pinned_events', '');
  const pinned = ev?.getContent?.()?.pinned;
  return Array.isArray(pinned) ? pinned.filter(Boolean) : [];
}

function canPin(room) {
  if (state.demo) return true;
  return !!room?.currentState?.mayClientSendStateEvent?.('m.room.pinned_events', state.client);
}

function isPinned(eventId) {
  return pinnedIds(getCurrentRoom()).includes(eventId);
}

function renderPinnedBar() {
  const bar = $('#pinned-bar');
  if (!bar) return;
  const ids = pinnedIds(getCurrentRoom());
  if (ids.length) {
    bar.classList.remove('hidden');
    $('#pinned-label').textContent = `Закреплено: ${ids.length}`;
  } else {
    bar.classList.add('hidden');
  }
}

function openPinnedModal() {
  const room = getCurrentRoom();
  const body = $('#pinned-body');
  if (!room || !body) return;
  const ids = pinnedIds(room);
  if (!ids.length) {
    body.innerHTML = `<div class="bookmark-empty">${icon('pin')}<p style="margin-top:10px;">Закреплённых сообщений пока нет.</p></div>`;
    openModal('pinned-modal');
    return;
  }
  const canManage = canPin(room);
  body.innerHTML = ids.map((id) => {
    let sender = '';
    let text = 'Сообщение не найдено';
    let ts = 0;
    let avatar = '';
    if (state.demo) {
      const m = room.messages?.find((x) => x.id === id);
      if (m) {
        sender = m.name || '';
        text = m.body || 'Голосовое сообщение';
        ts = m.ts;
        avatar = avatarHtml(m.name);
      }
    } else {
      const ev = room.findEventById?.(id);
      if (ev) {
        const member = room.getMember?.(ev.getSender());
        sender = member?.name || ev.getSender();
        const c = ev.getContent() || {};
        text = c.body || (c.msgtype === 'm.image' ? 'Изображение' : c.msgtype === 'm.audio' ? 'Аудио' : c.msgtype === 'm.file' ? 'Файл' : 'Сообщение');
        ts = ev.getTs();
        avatar = avatarHtml(sender, member?.getAvatarUrl?.(state.client?.getHomeserverUrl?.(), 64, 64, 'crop'));
      }
    }
    return `
      <div class="bookmark-item">
        <button class="bookmark-main" data-pinned-jump="${escapeAttr(id)}" style="border:0;background:transparent;text-align:left;padding:0;display:flex;gap:10px;align-items:flex-start;flex:1;min-width:0;">
          ${avatar}
          <span class="bookmark-main" style="display:flex;flex-direction:column;gap:3px;min-width:0;">
            <strong>${escapeHtml(sender || 'Участник')}</strong>
            <p>${escapeHtml(text).slice(0, 400)}</p>
            <small>${ts ? formatDateLabel(ts) + ' · ' + formatTime(ts) : ''}</small>
          </span>
        </button>
        ${canManage ? `<button class="icon-btn bookmark-del" data-pinned-remove="${escapeAttr(id)}" title="Открепить">${icon('pin')}</button>` : ''}
      </div>`;
  }).join('');
  openModal('pinned-modal');
}

async function togglePin(msg) {
  const room = getCurrentRoom();
  if (!room || !msg) return;
  const list = [...pinnedIds(room)];
  const idx = list.indexOf(msg.id);
  if (idx >= 0) {
    list.splice(idx, 1);
    toast('Сообщение откреплено', 'info', 1800);
  } else {
    list.push(msg.id);
    toast('Сообщение закреплено', 'success', 1800);
  }
  if (state.demo) {
    room.pinned = list;
    renderPinnedBar();
    renderMessages(false);
    return;
  }
  try {
    await state.client.sendStateEvent(room.roomId, 'm.room.pinned_events', { pinned: list }, '');
    renderPinnedBar();
    renderMessages(false);
  } catch {
    toast('Не удалось изменить закреплённые сообщения', 'error');
  }
}

function messageLabel(msg) {
  if (!msg) return 'Сообщение';
  if (msg.body) return msg.body;
  if (msg.msgtype === 'm.image') return 'Изображение';
  if (msg.msgtype === 'm.audio') return 'Аудио';
  if (msg.msgtype === 'm.video') return 'Видео';
  if (msg.msgtype === 'm.file') return 'Файл';
  return 'Сообщение';
}

function toggleBookmark(msg) {
  if (!msg || !state.currentRoomId) return;
  const idx = state.bookmarks.findIndex((b) => b.id === msg.id && b.roomId === state.currentRoomId);
  if (idx >= 0) {
    state.bookmarks.splice(idx, 1);
    toast('Убрано из сохранённых', 'info', 1800);
  } else {
    const room = getCurrentRoom();
    state.bookmarks.unshift({
      id: msg.id,
      roomId: state.currentRoomId,
      roomName: state.demo ? room.name : roomName(room),
      sender: msg.own ? 'Вы' : (msg.senderName || msg.sender),
      body: messageLabel(msg).slice(0, 600),
      ts: msg.ts,
      savedAt: Date.now(),
    });
    toast('Сохранено в избранное', 'success', 1800);
  }
  saveBookmarks();
  renderMessages(false);
}

function openBookmarks() {
  const body = $('#bookmarks-body');
  if (!body) return;
  const list = [...state.bookmarks].sort((a, b) => b.savedAt - a.savedAt);
  if (!list.length) {
    body.innerHTML = `<div class="bookmark-empty">${icon('bookmark')}<p style="margin-top:10px;">Пока пусто. Наведите на сообщение и нажмите на закладку, чтобы сохранить его здесь.</p></div>`;
  } else {
    body.innerHTML = list.map((b) => `
      <div class="bookmark-item">
        <button class="bookmark-main" data-bookmark-jump="${escapeAttr(b.id)}" data-bookmark-room="${escapeAttr(b.roomId)}" style="border:0;background:transparent;text-align:left;padding:0;">
          <strong>${escapeHtml(b.roomName || 'Комната')} · ${escapeHtml(b.sender || '')}</strong>
          <p>${escapeHtml(b.body || '')}</p>
          <small>${formatDateLabel(b.ts)} · ${formatTime(b.ts)}</small>
        </button>
        <button class="icon-btn bookmark-del" data-bookmark-delete="${escapeAttr(b.id)}" data-bookmark-room="${escapeAttr(b.roomId)}" title="Удалить">${icon('trash')}</button>
      </div>`).join('');
  }
  openModal('bookmarks-modal');
}

function jumpToBookmark(id, roomId) {
  closeModals();
  if (roomId && roomId !== state.currentRoomId) selectRoom(roomId);
  setTimeout(() => {
    const escaped = window.CSS?.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    const el = document.querySelector(`.msg[data-event-id="${escaped}"]`);
    if (!el) {
      toast('Сообщение не найдено в загруженной истории', 'info');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-highlight');
    setTimeout(() => el.classList.remove('msg-highlight'), 2200);
  }, 380);
}

function threadEventToMessage(ev, room) {
  const c = ev.getContent?.() || {};
  return {
    id: ev.getId(),
    sender: ev.getSender(),
    senderName: room?.getMember?.(ev.getSender())?.name || ev.getSender(),
    ts: ev.getTs(),
    msgtype: c.msgtype || 'm.text',
    body: c.body || '',
    content: c,
    own: ev.getSender() === state.userId,
    redacted: !!ev.isRedacted?.(),
    edited: false,
    reactions: {},
    encrypted: false,
    decryptionFailure: false,
  };
}

function openThreadModal(rootEventId) {
  const room = getCurrentRoom();
  if (!room || !rootEventId || state.demo) return;
  const thread = room.getThread?.(rootEventId);
  if (!thread) {
    toast('Ветка недоступна', 'info');
    return;
  }
  const body = $('#thread-body');
  if (!body) return;
  const rootMsg = thread.rootEvent ? threadEventToMessage(thread.rootEvent, room) : null;
  const replies = (thread.events || [])
    .filter((ev) => ev.getId() !== rootEventId && (ev.getType() === 'm.room.message' || ev.getType() === 'm.room.encrypted'))
    .map((ev) => threadEventToMessage(ev, room));
  body.innerHTML = [
    rootMsg ? messageHtml(rootMsg, false, { withTools: false }) : '',
    ...replies.map((m) => messageHtml(m, false, { withTools: false })),
  ].join('');
  $('#thread-input').value = '';
  $('#thread-input').dataset.threadRoot = rootEventId;
  $('#thread-input').dataset.threadRoom = room.roomId;
  openModal('thread-modal');
  setTimeout(() => $('#thread-input')?.focus(), 60);
}

async function sendThreadReply() {
  const input = $('#thread-input');
  const rootId = input?.dataset.threadRoot;
  const targetRoomId = input?.dataset.threadRoom || state.currentRoomId;
  const text = input?.value.trim();
  if (!rootId || !text || !targetRoomId) return;
  try {
    await state.client.sendEvent(targetRoomId, rootId, 'm.room.message', {
      msgtype: 'm.text',
      body: text,
      'm.relates_to': { rel_type: 'm.thread', event_id: rootId },
    });
    input.value = '';
    openThreadModal(rootId);
  } catch (err) {
    toast(err?.message || 'Не удалось отправить ответ в ветку', 'error');
  }
}

function openPrompt(title, label, value = '', confirmText = 'Сохранить', multiline = false) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true">
        <header class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" data-prompt-cancel>${icon('x')}</button></header>
        <div class="modal-body">
          <div class="field"><label>${escapeHtml(label)}</label><div class="input-wrap">
            ${multiline
              ? `<textarea class="modal-textarea" rows="4">${escapeHtml(value)}</textarea>`
              : `<input type="text" value="${escapeAttr(value)}" />`}
          </div></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-prompt-cancel>Отмена</button>
            <button class="btn btn-primary" data-prompt-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input, textarea');
    input?.focus();
    if (input) input.select?.();

    const close = (val) => {
      wrap.remove();
      resolve(val);
    };
    wrap.querySelectorAll('[data-prompt-cancel]').forEach((b) => b.addEventListener('click', () => close(null)));
    wrap.querySelector('[data-prompt-ok]')?.addEventListener('click', () => close(input?.value ?? ''));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(null);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !multiline && !e.shiftKey) {
        e.preventDefault();
        close(input?.value ?? '');
      }
    });
  });
}

function confirmDialog(title, text, confirmText = 'Удалить') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true">
        <header class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" data-confirm-cancel>${icon('x')}</button></header>
        <div class="modal-body">
          <p class="confirm-text">${escapeHtml(text)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-confirm-cancel>Отмена</button>
            <button class="btn btn-danger-soft" data-confirm-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = (val) => {
      wrap.remove();
      resolve(val);
    };
    wrap.querySelectorAll('[data-confirm-cancel]').forEach((b) => b.addEventListener('click', () => close(false)));
    wrap.querySelector('[data-confirm-ok]')?.addEventListener('click', () => close(true));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(false);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(false);
    });
  });
}

async function handleMessageAction(action, eventId, el) {
  const msg = findMessage(eventId);
  if (!msg) return;
  const roomId = state.currentRoomId;

  if (action === 'reply') {
    state.replyingTo = { id: msg.id, roomId: state.currentRoomId, name: msg.own ? 'Вы' : msg.senderName, body: msg.body };
    renderReplyBanner();
    $('#message-input')?.focus();
    return;
  }

  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(msg.body || '');
      toast('Скопировано', 'success', 1800);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
    return;
  }

  if (action === 'react') {
    openEmojiPicker(el, msg.id);
    return;
  }

  if (action === 'bookmark') {
    toggleBookmark(msg);
    return;
  }

  if (action === 'pin') {
    togglePin(msg);
    return;
  }

  if (action === 'thread') {
    openThreadModal(eventId);
    return;
  }

  if (action === 'edit') {
    if (!msg.own) return;
    const newText = await openPrompt('Изменить сообщение', 'Новый текст', msg.body, 'Сохранить', true);
    if (newText === null || !newText.trim()) return;
    if (state.demo) {
      msg.body = newText;
      const m = getCurrentRoom().messages.find((x) => x.id === msg.id);
      if (m) m.body = newText, m.edited = true;
      renderMessages(false);
      renderRooms();
      return;
    }
    try {
      await state.client.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: `* ${newText}`,
        'm.new_content': { msgtype: 'm.text', body: newText },
        'm.relates_to': { rel_type: 'm.replace', event_id: msg.id },
      });
      renderMessages(false);
      scheduleRooms();
    } catch (e) {
      toast('Не удалось изменить сообщение', 'error');
    }
    return;
  }

  if (action === 'delete') {
    if (!msg.own) return;
    const ok = await confirmDialog('Удалить сообщение?', 'Это действие нельзя отменить. Сообщение будет удалено для всех участников.');
    if (!ok) return;
    if (state.demo) {
      const room = getCurrentRoom();
      room.messages = room.messages.filter((m) => m.id !== msg.id);
      renderMessages(false);
      renderRooms();
      return;
    }
    try {
      await state.client.redactEvent(roomId, msg.id);
      renderMessages(false);
      scheduleRooms();
      toast('Сообщение удалено', 'success', 1800);
    } catch {
      toast('Не удалось удалить сообщение', 'error');
    }
  }
}

async function votePoll(startEventId, answerId) {
  if (!startEventId || !answerId) return;

  function nextSelections(msg) {
    const max = msg?.content?.['m.poll']?.max_selections || 1;
    if (max <= 1) return [answerId];
    const mine = (msg?.poll?.responses || []).filter((r) => r.sender === state.userId).pop()
      || (msg?.pollResponses || []).filter((r) => r.sender === '@you:matrix.org').pop();
    const set = new Set(mine?.selections || []);
    if (set.has(answerId)) set.delete(answerId);
    else set.add(answerId);
    return [...set];
  }

  if (state.demo) {
    const room = getCurrentRoom();
    const msg = room?.messages?.find((m) => m.id === startEventId);
    if (!msg) return;
    const selections = nextSelections(msg);
    const list = msg.pollResponses || [];
    const mine = list.find((r) => r.sender === '@you:matrix.org');
    if (mine) mine.selections = selections;
    else list.push({ sender: '@you:matrix.org', selections });
    msg.pollResponses = list;
    renderMessages(false);
    return;
  }
  const room = getCurrentRoom();
  const msg = room ? buildTimeline(room).find((m) => m.id === startEventId) : null;
  const selections = nextSelections(msg);
  try {
    await state.client.sendEvent(state.currentRoomId, 'm.poll.response', {
      'm.relates_to': { rel_type: 'm.reference', event_id: startEventId },
      'm.selections': selections,
    });
    renderMessages(false);
  } catch (err) {
    toast(err?.message || 'Не удалось проголосовать', 'error');
  }
}

async function endPoll(startEventId) {
  if (!startEventId) return;
  const targetRoomId = state.currentRoomId;
  if (state.demo) {
    const room = state.demoRooms.find((r) => r.id === targetRoomId);
    const msg = room?.messages?.find((m) => m.id === startEventId);
    if (msg) msg.pollEnded = true;
    renderMessages(false);
    return;
  }
  const ok = await confirmDialog('Завершить опрос?', 'После завершения голосовать будет нельзя.', 'Завершить');
  if (!ok || !targetRoomId) return;
  try {
    await state.client.sendEvent(targetRoomId, 'm.poll.end', {
      'm.relates_to': { rel_type: 'm.reference', event_id: startEventId },
      'org.matrix.msc3381.poll.end': {},
    });
    renderMessages(false);
  } catch (err) {
    toast(err?.message || 'Не удалось завершить опрос', 'error');
  }
}

async function createPoll() {
  const question = $('#poll-question').value.trim();
  const options = [
    $('#poll-opt-1').value.trim(),
    $('#poll-opt-2').value.trim(),
    $('#poll-opt-3').value.trim(),
    $('#poll-opt-4').value.trim(),
  ].filter(Boolean);
  const multi = $('#poll-multi').checked;
  const error = $('#poll-error');
  error.textContent = '';
  if (!question) {
    error.textContent = 'Введите вопрос опроса.';
    return;
  }
  if (options.length < 2) {
    error.textContent = 'Нужно минимум два варианта ответа.';
    return;
  }
  const answers = options.map((text, i) => ({
    id: String.fromCharCode(65 + i),
    'org.matrix.msc1767.text': text,
  }));
  const pollContent = {
    'm.poll': {
      question,
      kind: 'org.matrix.msc3381.poll.disclosed',
      max_selections: multi ? options.length : 1,
      answers,
    },
    'org.matrix.msc3381.poll.start': {},
  };

  if (state.demo) {
    const room = getCurrentRoom();
    room.messages.push({
      id: `demo-poll-${Date.now()}`,
      sender: '@you:matrix.org',
      name: state.profile.displayName || 'Вы',
      ts: Date.now(),
      body: question,
      msgtype: 'm.poll',
      isOwn: true,
      reactions: {},
      poll: true,
      pollResponses: [],
      content: pollContent,
    });
    closeModals();
    renderMessages(true);
    renderRooms();
    return;
  }

  try {
    await state.client.sendEvent(state.currentRoomId, 'm.poll.start', pollContent);
    closeModals();
    renderMessages(true);
  } catch (err) {
    error.textContent = err?.message || 'Не удалось создать опрос';
  }
}

function openPollModal() {
  ['#poll-question', '#poll-opt-1', '#poll-opt-2', '#poll-opt-3', '#poll-opt-4'].forEach((sel) => {
    const el = $(sel);
    if (el) el.value = '';
  });
  $('#poll-multi').checked = false;
  $('#poll-error').textContent = '';
  openModal('poll-modal');
  setTimeout(() => $('#poll-question')?.focus(), 60);
}

async function toggleReaction(key, targetId, reactionEventId) {
  if (!state.currentRoomId) return;
  if (state.demo) {
    const msg = findMessage(targetId);
    if (!msg) return;
    const current = msg.reactions[key] || { count: 0, mine: false };
    if (current.mine) {
      if (current.count <= 1) delete msg.reactions[key];
      else msg.reactions[key] = { count: current.count - 1, mine: false };
    } else {
      msg.reactions[key] = { count: current.count + 1, mine: true };
    }
    renderMessages(false);
    renderRooms();
    return;
  }

  try {
    if (reactionEventId) {
      await state.client.redactEvent(state.currentRoomId, reactionEventId);
    } else {
      await state.client.sendEvent(state.currentRoomId, 'm.reaction', {
        'm.relates_to': { rel_type: 'm.annotation', event_id: targetId, key },
      });
    }
    renderMessages(false);
    scheduleRooms();
  } catch {
    toast('Не удалось поставить реакцию', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   Emoji picker
   ════════════════════════════════════════════════════════════ */
function openEmojiPicker(anchor, targetEventId = null) {
  const pop = $('#emoji-pop');
  if (!pop) return;

  if (!pop.classList.contains('hidden')) {
    pop.classList.add('hidden');
    return;
  }

  pop.style.width = '330px';
  pop.classList.remove('hidden');
  renderEmojiPicker(pop, {
    onPick: (emoji) => {
      pop.classList.add('hidden');
      if (targetEventId) {
        const msg = findMessage(targetEventId);
        const existing = msg?.reactions?.[emoji];
        toggleReaction(emoji, targetEventId, existing?.mine ? existing.eventId : null);
      } else {
        insertAtCursor($('#message-input'), emoji);
      }
    },
  });

  setTimeout(() => pop.querySelector('.ep-search')?.focus(), 50);
  const rect = anchor?.getBoundingClientRect();
  const width = pop.offsetWidth || 330;
  const height = pop.offsetHeight || 400;
  let left = rect ? rect.left : window.innerWidth / 2 - width / 2;
  let top = rect ? rect.bottom + 8 : window.innerHeight / 2;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
  if (top + height > window.innerHeight - 12) top = (rect ? rect.top - height - 8 : window.innerHeight - height - 12);
  pop.style.left = Math.max(12, left) + 'px';
  pop.style.top = Math.max(12, top) + 'px';
}

function insertAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  resizeComposer();
}

/* ───────── Mentions autocomplete ───────── */
const mentionState = { open: false, items: [], index: 0, tokenStart: 0, query: '' };

function mentionLocalCandidates(room) {
  if (!room) return [];
  const seen = new Set();
  const out = [];
  const members = state.demo
    ? (room.members || []).map((m) => ({ id: m.id, name: m.name, avatar: null }))
    : (room.getMembers?.() || []).map((m) => ({
        id: m.userId,
        name: m.name || m.userId,
        avatar: m.getAvatarUrl?.(state.client?.getHomeserverUrl?.(), 48, 48, 'crop') || null,
      }));
  for (const m of members) {
    if (!m.id || m.id === state.userId || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

function openMentionPop(items, tokenStart, query) {
  const pop = $('#mention-pop');
  if (!pop) return;
  if (!items.length) {
    closeMentionPop();
    return;
  }
  mentionState.open = true;
  mentionState.items = items;
  mentionState.index = 0;
  mentionState.tokenStart = tokenStart;
  mentionState.query = query;
  pop.classList.remove('hidden');
  pop.setAttribute('role', 'listbox');
  $('#message-input')?.setAttribute('aria-expanded', 'true');
  pop.innerHTML = items
    .slice(0, 8)
    .map((item, i) => `
      <button type="button" class="mention-item ${i === 0 ? 'active' : ''}" role="option" aria-selected="${i === 0}" data-mention-index="${i}" data-mention-id="${escapeAttr(item.id)}">
        ${item.avatar ? `<img class="mention-avatar" src="${escapeAttr(mxcToUrl(item.avatar, 48, 48, 'crop'))}" alt="" />` : avatarHtml(item.name || item.id, item.avatar, 'avatar-36').replace('class="avatar avatar-36"', 'class="avatar avatar-36 mention-avatar"')}
        <span class="mention-name">${escapeHtml(item.name || item.id)}</span>
        <span class="mention-id">${escapeHtml(item.id)}</span>
      </button>`)
    .join('');
}

function closeMentionPop() {
  const pop = $('#mention-pop');
  mentionState.open = false;
  pop?.classList.add('hidden');
  $('#message-input')?.setAttribute('aria-expanded', 'false');
}

function mentionCaretContext(input) {
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const match = before.match(/(^|[\s(])@([^\s]*)$/);
  if (!match) return null;
  return { tokenStart: caret - match[0].length + match[1].length, query: match[2] };
}

const scheduleMentions = debounce(() => {
  const input = $('#message-input');
  if (!input || !state.currentRoomId) {
    closeMentionPop();
    return;
  }
  const ctx = mentionCaretContext(input);
  if (!ctx) {
    closeMentionPop();
    return;
  }
  const room = getCurrentRoom();
  const local = mentionLocalCandidates(room);
  const q = ctx.query.toLowerCase();
  const filtered = local.filter((m) => !q || `${m.name} ${m.id}`.toLowerCase().includes(q));
  openMentionPop(filtered, ctx.tokenStart, ctx.query);

  // Remote directory for longer queries when local results are few
  if (!state.demo && state.client && q.length >= 2 && filtered.length < 5) {
    state.client
      .searchUserDirectory({ term: q, limit: 8 })
      .then((res) => {
        if (!mentionState.open || mentionState.query !== ctx.query) return;
        const extra = (res.results || [])
          .filter((u) => u.user_id !== state.userId && !filtered.some((m) => m.id === u.user_id))
          .map((u) => ({ id: u.user_id, name: u.display_name || u.user_id, avatar: u.avatar_url || null }));
        const merged = [...filtered, ...extra].slice(0, 8);
        openMentionPop(merged, ctx.tokenStart, ctx.query);
      })
      .catch(() => {});
  }
}, 160);

function moveMention(delta) {
  if (!mentionState.open || !mentionState.items.length) return;
  mentionState.index = (mentionState.index + delta + mentionState.items.length) % mentionState.items.length;
  $$('#mention-pop .mention-item').forEach((el, i) => {
    el.classList.toggle('active', i === mentionState.index);
    el.setAttribute('aria-selected', String(i === mentionState.index));
  });
  $('#mention-pop .mention-item.active')?.scrollIntoView({ block: 'nearest' });
}

function selectMention(id) {
  const input = $('#message-input');
  if (!input) return;
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, mentionState.tokenStart);
  const after = input.value.slice(caret);
  input.value = `${before}${id} ${after}`;
  const pos = before.length + id.length + 1;
  input.selectionStart = input.selectionEnd = pos;
  closeMentionPop();
  input.focus();
  resizeComposer();
  sendTypingState();
}

function initMentionPop() {
  const wrap = $('.composer-wrap');
  if (!wrap || $('#mention-pop')) return;
  const pop = document.createElement('div');
  pop.className = 'mention-pop hidden';
  pop.id = 'mention-pop';
  const composer = wrap.querySelector('.composer');
  (composer || wrap).appendChild(pop);
  pop.addEventListener('mousedown', (e) => {
    const item = e.target.closest('[data-mention-id]');
    if (item) {
      e.preventDefault();
      selectMention(item.dataset.mentionId);
    }
  });
  pop.addEventListener('mouseenter', (e) => {
    const item = e.target.closest('[data-mention-index]');
    if (item) {
      mentionState.index = Number(item.dataset.mentionIndex);
      $$('#mention-pop .mention-item').forEach((el, i) => {
        el.classList.toggle('active', i === mentionState.index);
        el.setAttribute('aria-selected', String(i === mentionState.index));
      });
    }
  });
  $('#message-input')?.setAttribute('aria-controls', 'mention-pop');
  $('#message-input')?.setAttribute('aria-expanded', 'false');
}

/* ════════════════════════════════════════════════════════════
   Room management
   ════════════════════════════════════════════════════════════ */
async function createRoom() {
  const name = $('#new-room-name').value.trim();
  const topic = $('#new-room-topic').value.trim();
  const isPublic = $('#new-room-public').checked;
  const error = $('#new-room-error');
  error.textContent = '';
  if (!name) {
    error.textContent = 'Введите название комнаты.';
    return;
  }

  if (state.demo) {
    const room = {
      id: `!demo-${Date.now()}:matrix.org`,
      name,
      topic: topic || 'Новая комната',
      unread: 0,
      members: [{ name: state.profile.displayName || 'Вы', id: '@you:matrix.org', power: 100 }],
      messages: [],
    };
    state.demoRooms.unshift(room);
    closeModals();
    renderRooms();
    selectRoom(room.id);
    return;
  }

  try {
    const roomId = await state.client.createRoom({
      name,
      topic: topic || undefined,
      visibility: isPublic ? 'public' : 'private',
      preset: isPublic ? (matrixcs.Preset?.PublicChat || 'public_chat') : (matrixcs.Preset?.PrivateChat || 'private_chat'),
    });
    closeModals();
    $('#new-room-name').value = '';
    $('#new-room-topic').value = '';
    renderRooms();
    selectRoom(roomId);
    toast('Комната создана', 'success');
  } catch (e) {
    console.error(e);
    error.textContent = e?.message || 'Не удалось создать комнату.';
  }
}

async function startDM(userIdInput) {
  let userId = (userIdInput || $('#dm-user').value).trim();
  const error = $('#new-room-error');
  error.textContent = '';
  if (!userId) {
    error.textContent = 'Введите Matrix ID пользователя.';
    return;
  }
  if (!userId.startsWith('@')) userId = '@' + userId;
  if (!userId.includes(':')) {
    error.textContent = 'Укажите полный Matrix ID, например @user:matrix.org.';
    return;
  }

  if (state.demo) {
    const name = userId.replace(/^@/, '').split(':')[0];
    const room = {
      id: `!dm-${Date.now()}:matrix.org`,
      name,
      topic: 'Личные сообщения',
      unread: 0,
      members: [{ name: state.profile.displayName || 'Вы', id: '@you:matrix.org', power: 0 }, { name, id: userId, power: 0 }],
      messages: [],
    };
    state.demoRooms.unshift(room);
    closeModals();
    renderRooms();
    selectRoom(room.id);
    return;
  }

  try {
    const roomId = await state.client.createRoom({
      is_direct: true,
      invite: [userId],
      preset: matrixcs.Preset?.TrustedPrivateChat || 'trusted_private_chat',
    });
    closeModals();
    $('#dm-user').value = '';
    renderRooms();
    selectRoom(roomId);
    toast('Личная переписка создана', 'success');
  } catch (err) {
    error.textContent = err?.message || 'Не удалось создать личную переписку.';
  }
}

async function joinRoom() {
  const value = $('#join-room-id').value.trim();
  const error = $('#new-room-error');
  error.textContent = '';
  if (!value) {
    error.textContent = 'Введите адрес или ID комнаты.';
    return;
  }
  if (state.demo) {
    toast('В демо-режиме присоединение недоступно', 'info');
    return;
  }
  try {
    const roomId = await state.client.joinRoom(value);
    closeModals();
    $('#join-room-id').value = '';
    renderRooms();
    selectRoom(roomId);
    toast('Вы присоединились к комнате', 'success');
  } catch (e) {
    console.error(e);
    error.textContent = e?.message || 'Не удалось войти в комнату.';
  }
}

/* ════════════════════════════════════════════════════════════
   Invites, directory, global search, room settings, user profile
   ════════════════════════════════════════════════════════════ */
function joinedSpaces() {
  if (state.demo) return state.demoSpaces || [];
  return (state.client?.getRooms() || []).filter((room) => room.isSpaceRoom?.());
}

function renderSpaces() {
  const block = $('#spaces-block');
  const list = $('#space-list');
  if (!block || !list) return;
  const spaces = joinedSpaces();
  block.classList.toggle('hidden', spaces.length === 0);
  if (!spaces.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = spaces.map((space) => {
    const name = state.demo ? space.name : roomName(space);
    const avatar = state.demo ? avatarHtml(name) : avatarHtml(name, roomAvatarMxc(space));
    return `<button class="space-item" data-space-id="${escapeAttr(state.demo ? space.id : space.roomId)}">${avatar}<span>${escapeHtml(name)}</span></button>`;
  }).join('');
}

function renderSpaceHierarchy(spaceId) {
  const body = $('#space-body');
  if (!body) return;
  if (state.demo) {
    const space = state.demoSpaces.find((x) => x.id === spaceId);
    const children = space?.children || [];
    body.innerHTML = children.map((child) => `
      <div class="directory-room">
        ${avatarHtml(child.name)}
        <div class="directory-main"><strong>${escapeHtml(child.name)}</strong><small>${escapeHtml(child.topic || 'Комната пространства')}</small></div>
        <button class="btn btn-primary btn-sm" data-space-join="${escapeAttr(child.id)}">${state.demoRooms.some((r) => r.id === child.id) ? 'Открыть' : 'Войти'}</button>
      </div>`).join('') || '<div class="bookmark-empty">В пространстве пока нет комнат</div>';
    return;
  }
  const room = state.client.getRoom(spaceId);
  $('#space-title').textContent = roomName(room);
  body.innerHTML = `<div class="bookmark-empty">${icon('loader')}<p style="margin-top:8px;">Загружаем…</p></div>`;
  state.client.getRoomHierarchy(spaceId, 50, 1)
    .then((res) => {
      const rooms = (res.rooms || []).filter((r) => r.room_id !== spaceId);
      if (!rooms.length) {
        body.innerHTML = '<div class="bookmark-empty">В пространстве пока нет комнат</div>';
        return;
      }
      body.innerHTML = rooms.map((r) => {
        const joined = !!state.client.getRoom(r.room_id);
        return `
          <div class="directory-room">
            ${avatarHtml(r.name || r.canonical_alias || r.room_id, r.avatar_url || null)}
            <div class="directory-main"><strong>${escapeHtml(r.name || r.canonical_alias || r.room_id)}</strong><small>${escapeHtml((r.topic || '').slice(0, 90))} · ${r.num_joined_members || 0} участников</small></div>
            <button class="btn btn-primary btn-sm" data-space-join="${escapeAttr(r.room_id)}">${joined ? 'Открыть' : 'Войти'}</button>
          </div>`;
      }).join('');
    })
    .catch((err) => {
      body.innerHTML = `<div class="bookmark-empty">${escapeHtml(err?.message || 'Не удалось загрузить пространство')}</div>`;
    });
}

function openSpace(spaceId) {
  $('#space-title').textContent = 'Пространство';
  renderSpaceHierarchy(spaceId);
  openModal('space-modal');
}

function invitedRooms() {
  if (state.demo) return [];
  return (state.client?.getRooms() || []).filter(
    (room) => !room.isSpaceRoom?.() && room.getMyMembership?.() === 'invite'
  );
}

function renderInvites() {
  const block = $('#invites-block');
  const list = $('#invite-list');
  if (!block || !list) return;
  const invites = invitedRooms();
  $('#invite-count').textContent = String(invites.length);
  block.classList.toggle('hidden', invites.length === 0);
  if (!invites.length) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = invites.map((room) => `
    <div class="invite-item">
      ${avatarHtml(roomName(room), roomAvatarMxc(room), '')}
      <div class="invite-main">
        <strong>${escapeHtml(roomName(room))}</strong>
        <small>${escapeHtml((room.getTopic?.() || '').slice(0, 60))}</small>
      </div>
      <div class="invite-actions">
        <button class="icon-btn accept" data-invite-accept="${escapeAttr(room.roomId)}" title="Принять">${icon('check')}</button>
        <button class="icon-btn decline" data-invite-decline="${escapeAttr(room.roomId)}" title="Отклонить">${icon('x')}</button>
      </div>
    </div>`).join('');
}

async function acceptInvite(roomId) {
  try {
    await state.client.joinRoom(roomId);
    toast('Вы присоединились к комнате', 'success');
    selectRoom(roomId);
  } catch (err) {
    toast(err?.message || 'Не удалось принять приглашение', 'error');
  }
}

async function declineInvite(roomId) {
  try {
    await state.client.leave(roomId);
    renderRooms();
    toast('Приглашение отклонено', 'info', 1800);
  } catch (err) {
    toast(err?.message || 'Не удалось отклонить приглашение', 'error');
  }
}

/* Directory */
function openDirectory() {
  $('#directory-search').value = '';
  $('#directory-results').innerHTML = '';
  openModal('directory-modal');
  searchDirectory('');
}

async function searchDirectory(term) {
  const results = $('#directory-results');
  if (!results) return;
  if (state.demo) {
    results.innerHTML = `
      <div class="directory-note">В демо-режиме директория не подключена. Вот примеры:</div>
      ${['Технологии и код', 'Книжный клуб', 'Игры по вечерам'].map((name) => `
        <div class="directory-room">
          ${avatarHtml(name)}
          <div class="directory-main"><strong>${escapeHtml(name)}</strong><small>Публичная комната · демо</small></div>
          <button class="btn btn-primary btn-sm" data-directory-join="demo-${escapeAttr(name)}">Войти</button>
        </div>`).join('')}`;
    return;
  }
  results.innerHTML = `<div class="bookmark-empty">${icon('loader')}<p style="margin-top:8px;">Поиск…</p></div>`;
  try {
    const res = await state.client.publicRooms({
      limit: 40,
      ...(term ? { filter: { generic_search_term: term } } : {}),
    });
    const chunk = res.chunk || [];
    if (!chunk.length) {
      results.innerHTML = '<div class="bookmark-empty">Ничего не найдено</div>';
      return;
    }
    results.innerHTML = chunk.map((room) => `
      <div class="directory-room">
        ${avatarHtml(room.name || room.canonical_alias || room.room_id, room.avatar_url || null)}
        <div class="directory-main">
          <strong>${escapeHtml(room.name || room.canonical_alias || room.room_id)}</strong>
          <small>${escapeHtml((room.topic || '').slice(0, 90))} · ${room.num_joined_members} участников</small>
        </div>
        <button class="btn btn-primary btn-sm" data-directory-join="${escapeAttr(room.room_id)}">${clientRooms().some((r) => r.roomId === room.room_id) ? 'Открыть' : 'Войти'}</button>
      </div>`).join('');
  } catch (err) {
    results.innerHTML = `<div class="bookmark-empty">${escapeHtml(err?.message || 'Не удалось загрузить директорию')}</div>`;
  }
}

async function joinDirectoryRoom(roomId) {
  if (!roomId) return;
  if (state.demo) {
    const name = roomId.replace('demo-', '');
    const room = {
      id: `!${Date.now()}:matrix.org`,
      name,
      topic: 'Публичная комната (демо)',
      unread: 0,
      members: [{ name: state.profile.displayName || 'Вы', id: '@you:matrix.org', power: 0 }],
      messages: [],
    };
    state.demoRooms.unshift(room);
    closeModals();
    renderRooms();
    selectRoom(room.id);
    return;
  }
  try {
    await state.client.joinRoom(roomId);
    closeModals();
    renderRooms();
    selectRoom(roomId);
    toast('Вы присоединились к комнате', 'success');
  } catch (err) {
    toast(err?.message || 'Не удалось войти в комнату', 'error');
  }
}

/* Global search */
function openGlobalSearch() {
  $('#search-query').value = '';
  $('#search-results').innerHTML = '';
  state.searchTab = 'messages';
  $$('#search-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.stab === 'messages'));
  openModal('search-modal');
  setTimeout(() => $('#search-query')?.focus(), 60);
}

async function runGlobalSearch() {
  const query = $('#search-query').value.trim();
  const results = $('#search-results');
  if (!query || !results) return;
  const tab = state.searchTab;
  results.innerHTML = `<div class="bookmark-empty">${icon('loader')}<p style="margin-top:8px;">Ищем…</p></div>`;

  if (tab === 'people') {
    if (!state.client || state.demo) {
      results.innerHTML = '<div class="bookmark-empty">Поиск людей доступен после входа</div>';
      return;
    }
    try {
      const res = await state.client.searchUserDirectory({ term: query, limit: 20 });
      const list = res.results || [];
      if (!list.length) {
        results.innerHTML = '<div class="bookmark-empty">Никого не нашли</div>';
        return;
      }
      results.innerHTML = list.map((u) => `
        <div class="search-row">
          ${avatarHtml(u.display_name || u.user_id, u.avatar_url || null)}
          <div class="search-main"><strong>${escapeHtml(u.display_name || u.user_id)}</strong><small>${escapeHtml(u.user_id)}</small></div>
          <button class="btn btn-primary btn-sm" data-user-dm="${escapeAttr(u.user_id)}">Написать</button>
        </div>`).join('');
    } catch (err) {
      results.innerHTML = `<div class="bookmark-empty">${escapeHtml(err?.message || 'Ошибка поиска')}</div>`;
    }
    return;
  }

  if (tab === 'rooms') {
    if (state.demo) {
      const matches = state.demoRooms.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
      results.innerHTML = matches.length
        ? matches.map((room) => `
          <div class="search-row">
            ${avatarHtml(room.name)}
            <div class="search-main"><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml(room.topic)}</small></div>
            <button class="btn btn-primary btn-sm" data-search-room="${escapeAttr(room.id)}">Открыть</button>
          </div>`).join('')
        : '<div class="bookmark-empty">Ничего не найдено</div>';
      return;
    }
    const local = clientRooms().filter((r) => `${roomName(r)} ${r.roomId} ${r.getTopic?.() || ''}`.toLowerCase().includes(query.toLowerCase()));
    let remote = [];
    try {
      const res = await state.client.publicRooms({ limit: 30, filter: { generic_search_term: query } });
      remote = res.chunk || [];
    } catch {}
    const seen = new Set(local.map((r) => r.roomId));
    const merged = [
      ...local.map((r) => ({ id: r.roomId, name: roomName(r), topic: r.getTopic?.() || '', members: r.getJoinedMemberCount?.() || 0, joined: true, avatar: roomAvatarMxc(r) })),
      ...remote.filter((r) => !seen.has(r.room_id)).map((r) => ({ id: r.room_id, name: r.name || r.canonical_alias || r.room_id, topic: r.topic || '', members: r.num_joined_members, joined: false, avatar: r.avatar_url || null })),
    ];
    if (!merged.length) {
      results.innerHTML = '<div class="bookmark-empty">Ничего не найдено</div>';
      return;
    }
    results.innerHTML = merged.map((room) => `
      <div class="search-row">
        ${avatarHtml(room.name, room.avatar)}
        <div class="search-main"><strong>${escapeHtml(room.name)}</strong><small>${escapeHtml((room.topic || '').slice(0, 90))} · ${room.members} участников</small></div>
        <button class="btn btn-primary btn-sm" data-search-room="${escapeAttr(room.id)}">${room.joined ? 'Открыть' : 'Войти'}</button>
      </div>`).join('');
    return;
  }

  // messages
  if (!state.client || state.demo) {
    results.innerHTML = '<div class="bookmark-empty">Поиск сообщений доступен после входа</div>';
    return;
  }
  try {
    const res = await state.client.searchRoomEvents({ term: query, filter: { limit: 20 } });
    const rows = res.results || [];
    if (!rows.length) {
      results.innerHTML = '<div class="bookmark-empty">Ничего не найдено</div>';
      return;
    }
    results.innerHTML = rows.map((r) => {
      const ev = r.result || {};
      const roomId = ev.room_id || '';
      const room = state.client.getRoom(roomId);
      const senderName = r.context?.profile_info?.[ev.sender]?.displayname || ev.sender || '';
      const body = (ev.content?.body || '').replace(/\s+/g, ' ').slice(0, 160);
      const joined = !!room;
      return `
        <div class="search-row">
          ${avatarHtml(joined ? roomName(room) : senderName)}
          <div class="search-main">
            <strong>${escapeHtml(joined ? roomName(room) : roomId)}</strong>
            <small>${escapeHtml(senderName)}${ev.origin_server_ts ? ' · ' + formatDateLabel(ev.origin_server_ts) : ''}</small>
            <p>${escapeHtml(body)}</p>
          </div>
          <button class="btn btn-primary btn-sm" data-search-room="${escapeAttr(roomId)}">${joined ? 'Открыть' : 'Войти'}</button>
        </div>`;
    }).join('');
  } catch (err) {
    results.innerHTML = `<div class="bookmark-empty">${escapeHtml(err?.message || 'Ошибка поиска')}</div>`;
  }
}

/* Room settings */
function canEditRoom(room) {
  if (state.demo) return true;
  if (!room?.currentState) return false;
  const userId = state.userId;
  return (
    room.currentState.maySendStateEvent?.('m.room.name', userId) ||
    room.currentState.mayClientSendStateEvent?.('m.room.name', state.client)
  );
}

function roomNotifLevel(roomId) {
  if (state.demo) return state.demoNotif?.[roomId] || 'all';
  try {
    const rule = state.client?.getRoomPushRule?.('global', roomId);
    if (!rule) return 'all';
    const actions = rule.actions || [];
    if (actions.includes('dont_notify')) return 'mute';
    const highlight = actions.find((a) => a && typeof a === 'object' && a.set_tweak === 'highlight');
    if (highlight && highlight.value === false) return 'mention';
    return 'all';
  } catch {
    return 'all';
  }
}

async function setRoomNotifLevel(level) {
  const roomId = state.currentRoomId;
  if (!roomId) return;
  if (state.demo) {
    state.demoNotif = state.demoNotif || {};
    state.demoNotif[roomId] = level;
    toast(`Уведомления: ${level === 'all' ? 'все' : level === 'mention' ? 'упоминания' : 'выключены'} (демо)`, 'success', 1800);
    updateNotifSeg();
    return;
  }
  const ruleId = '!' + roomId;
  try {
    if (level === 'all') {
      if (state.client.getRoomPushRule?.('global', roomId)) {
        await state.client.deletePushRule('global', 'room', ruleId);
      }
    } else if (level === 'mute') {
      await state.client.addPushRule('global', 'room', ruleId, { actions: ['dont_notify'] });
    } else if (level === 'mention') {
      await state.client.addPushRule('global', 'room', ruleId, { actions: ['notify', { set_tweak: 'highlight', value: false }] });
    }
    toast('Настройки уведомлений обновлены', 'success');
    updateNotifSeg();
  } catch (err) {
    toast(err?.message || 'Не удалось обновить уведомления', 'error');
  }
}

function updateNotifSeg() {
  const level = roomNotifLevel(state.currentRoomId);
  $$('#room-notif-seg [data-notif]').forEach((b) => b.classList.toggle('active', b.dataset.notif === level));
}

function openRoomSettings() {
  const room = getCurrentRoom();
  if (!room) return;
  if (!canEditRoom(room)) {
    toast('Недостаточно прав для изменения настроек комнаты', 'error');
    return;
  }
  state.roomAvatarFile = null;
  $('#room-settings-error').textContent = '';
  if (state.demo) {
    $('#room-settings-name').value = room.name || '';
    $('#room-settings-topic').value = room.topic || '';
    $('#room-settings-alias').value = '';
    $('#room-avatar-settings').innerHTML = `
      ${avatarHtml(room.name, null, 'avatar-56')}
      <label class="btn btn-ghost btn-sm"><span data-icon="camera"></span> Аватар<input type="file" id="room-avatar-input" accept="image/*" hidden /></label>`;
    openModal('room-settings-modal');
    $('#room-avatar-input').addEventListener('change', (e) => {
      state.roomAvatarFile = e.target.files[0] || null;
    });
    return;
  }
  $('#room-settings-name').value = roomName(room);
  $('#room-settings-topic').value = room.getTopic?.() || '';
  $('#room-settings-alias').value = '';
  $('#room-avatar-settings').innerHTML = `
    ${avatarHtml(roomName(room), roomAvatarMxc(room), 'avatar-56')}
    <label class="btn btn-ghost btn-sm"><span data-icon="camera"></span> Аватар<input type="file" id="room-avatar-input" accept="image/*" hidden /></label>`;
  openModal('room-settings-modal');
  $('#room-avatar-input').addEventListener('change', (e) => {
    state.roomAvatarFile = e.target.files[0] || null;
  });
}

async function saveRoomSettings() {
  const room = getCurrentRoom();
  if (!room) return;
  const error = $('#room-settings-error');
  error.textContent = '';
  const name = $('#room-settings-name').value.trim();
  const topic = $('#room-settings-topic').value.trim();
  const alias = $('#room-settings-alias').value.trim();

  if (state.demo) {
    if (name) room.name = name;
    room.topic = topic;
    renderRoomHeader();
    renderRooms();
    closeModals();
    toast('Настройки комнаты сохранены (демо)', 'success');
    return;
  }

  try {
    if (name && name !== roomName(room)) {
      await state.client.sendStateEvent(room.roomId, 'm.room.name', { name }, '');
    }
    if (topic !== (room.getTopic?.() || '')) {
      await state.client.sendStateEvent(room.roomId, 'm.room.topic', { topic }, '');
    }
    if (alias) {
      let a = alias.trim();
      if (!a.startsWith('#')) a = '#' + a;
      await state.client.createAlias(a, room.roomId);
    }
    if (state.roomAvatarFile) {
      const upload = await state.client.uploadContent(state.roomAvatarFile, { name: 'avatar', type: state.roomAvatarFile.type });
      const mxc = upload?.content_uri || upload;
      await state.client.sendStateEvent(room.roomId, 'm.room.avatar', { url: mxc }, '');
    }
    state.roomAvatarFile = null;
    renderRoomHeader();
    renderRooms();
    closeModals();
    toast('Настройки комнаты сохранены', 'success');
  } catch (err) {
    error.textContent = err?.message || 'Не удалось сохранить настройки';
  }
}

/* ════════════════════════════════════════════════════════════
   1:1 calls (Matrix legacy VoIP / WebRTC)
   ════════════════════════════════════════════════════════════ */
function callRoom() {
  return state.client?.getRoom(state.call.call?.roomId) || getCurrentRoom();
}

function callPeerName() {
  const member = state.call.call?.getOpponentMember?.();
  if (member?.name) return member.name;
  return roomName(callRoom()) || 'Собеседник';
}

function callPeerAvatar() {
  const member = state.call.call?.getOpponentMember?.();
  if (!member) return null;
  try {
    return member.getAvatarUrl?.(state.client.getHomeserverUrl(), 144, 144, 'crop') || null;
  } catch {
    return null;
  }
}

function setCallAvatar() {
  const el = $('#call-avatar');
  if (!el) return;
  el.outerHTML = avatarHtml(callPeerName(), callPeerAvatar(), 'avatar-72').replace(
    '<span class="avatar avatar-72"',
    '<span id="call-avatar" class="avatar avatar-72"'
  );
}

function callStateText() {
  const call = state.call.call;
  if (!call) return '';
  if (state.call.incoming) return 'Входящий звонок…';
  switch (call.state) {
    case 'fledgling':
    case 'wait_local_media':
    case 'create_offer':
      return 'Подготовка…';
    case 'invite_sent':
      return 'Звоним…';
    case 'ringing':
      return 'Звоним…';
    case 'create_answer':
    case 'connecting':
      return 'Соединяем…';
    case 'connected':
      return `В звонке · ${formatDuration((Date.now() - state.call.startedAt) / 1000)}`;
    case 'ended':
      return 'Звонок завершён';
    default:
      return 'Звонок';
  }
}

function updateCallStatus() {
  const status = $('#call-status');
  if (status) status.textContent = callStateText();
}

function startCallTimer() {
  clearInterval(state.call.timer);
  state.call.timer = setInterval(() => updateCallStatus(), 1000);
}

function stopCallTimer() {
  clearInterval(state.call.timer);
  state.call.timer = null;
}

function updateCallFeeds() {
  const call = state.call.call;
  if (!call) return;
  const remoteVideo = $('#call-remote-video');
  const localVideo = $('#call-local-video');
  const remote = call.remoteUsermediaFeed?.stream || call.getRemoteFeeds?.()[0]?.stream || null;
  const local = call.localUsermediaStream || call.getLocalFeeds?.()[0]?.stream || null;

  const hasRemoteVideo = !!remote?.getVideoTracks?.().length;
  if (remoteVideo && remote) {
    if (remoteVideo.srcObject !== remote) remoteVideo.srcObject = remote;
    remoteVideo.classList.toggle('audio-only', !hasRemoteVideo);
    remoteVideo.play?.().catch(() => {});
  }
  $('#call-placeholder')?.classList.toggle('connected', hasRemoteVideo);
  if (localVideo) {
    if (local && localVideo.srcObject !== local) localVideo.srcObject = local;
    const hide = !local || call.isLocalVideoMuted?.() || call.type === 'voice';
    localVideo.classList.toggle('hidden', hide);
    if (!hide) localVideo.play?.().catch(() => {});
  }

  const camBtn = $('#call-cam');
  if (camBtn) {
    camBtn.classList.toggle('off', !!call.isLocalVideoMuted?.());
    camBtn.setAttribute('aria-pressed', String(!!call.isLocalVideoMuted?.()));
  }
  const micBtn = $('#call-mic');
  if (micBtn) {
    micBtn.classList.toggle('off', !!call.isMicrophoneMuted?.());
    micBtn.setAttribute('aria-pressed', String(!!call.isMicrophoneMuted?.()));
  }
}

function updateCallUI() {
  const call = state.call.call;
  if (!call) return;
  setCallAvatar();
  const name = $('#call-peer-name');
  if (name) name.textContent = callPeerName();
  updateCallStatus();
  updateCallFeeds();

  if (call.state === 'connected' && !state.call.startedAt) {
    state.call.startedAt = Date.now();
    startCallTimer();
    $('#call-incoming-actions')?.classList.add('hidden');
    $('#call-controls')?.classList.remove('hidden');
  }
  if (call.state === 'ended') {
    closeCallUI();
  }
}

function bindCallListeners(call) {
  if (!call || state.call.bound.has(call)) return;
  state.call.bound.add(call);
  call.on('state', updateCallUI);
  call.on('feeds_changed', updateCallFeeds);
  call.on('error', (err) => {
    console.warn('Call error', err);
    toast(err?.message || 'Ошибка звонка', 'error');
    closeCallUI();
  });
  call.on('hangup', () => closeCallUI());
}

function showCallUI(incoming) {
  const backdrop = $('#call-backdrop');
  if (!backdrop) return;
  if (backdrop.classList.contains('hidden')) overlayState.callReturnFocus = document.activeElement;
  backdrop.classList.remove('hidden');
  updateBackgroundInert();
  $('#call-card')?.classList.toggle('incoming', incoming);
  $('#call-incoming-actions')?.classList.toggle('hidden', !incoming);
  $('#call-controls')?.classList.toggle('hidden', incoming);
  $('#call-cam')?.classList.toggle('hidden', state.call.video === false);
  if (incoming) {
    $('#call-status').textContent = 'Входящий звонок…';
    startRingtone();
  } else {
    $('#call-status').textContent = 'Звоним…';
  }
  setCallAvatar();
  updateCallFeeds();
  setTimeout(() => {
    const target = incoming ? $('#call-accept') : $('#call-hangup');
    target?.focus?.();
  }, 80);
}

function startRingtone() {
  stopRingtone();
  playBeep();
  state.call.ringTimer = setInterval(playBeep, 2200);
}

function stopRingtone() {
  clearInterval(state.call.ringTimer);
  state.call.ringTimer = null;
}

function closeCallUI() {
  stopRingtone();
  stopCallTimer();
  const remote = $('#call-remote-video');
  const local = $('#call-local-video');
  if (remote) remote.srcObject = null;
  if (local) local.srcObject = null;
  const wasOpen = !$('#call-backdrop')?.classList.contains('hidden');
  $('#call-backdrop')?.classList.add('hidden');
  updateBackgroundInert();
  if (wasOpen && overlayState.callReturnFocus?.isConnected) overlayState.callReturnFocus.focus?.();
  overlayState.callReturnFocus = null;
  state.call = { call: null, incoming: false, video: false, startedAt: 0, timer: null, ringTimer: null, bound: state.call.bound };
}

async function startCall(video = false) {
  if (state.demo || !state.client) {
    toast('Звонки доступны после входа в аккаунт', 'info');
    return;
  }
  if (!state.client?.supportsVoip?.()) {
    toast('Звонки не поддерживаются этим браузером (нужен WebRTC)', 'error');
    return;
  }
  if (!state.currentRoomId) {
    toast('Сначала выберите чат', 'info');
    return;
  }
  if (state.call.call) {
    toast('Звонок уже идёт', 'info');
    return;
  }
  const room = getCurrentRoom();
  if ((room?.getJoinedMemberCount?.() || 0) > 2) {
    toast('Звонки 1:1 доступны в личных чатах (два участника)', 'info');
    return;
  }
  let call;
  try {
    call = state.client.createCall(state.currentRoomId);
  } catch (err) {
    toast(err?.message || 'Не удалось создать звонок', 'error');
    return;
  }
  if (!call) {
    toast('Не удалось создать звонок в этой комнате', 'error');
    return;
  }
  state.call.call = call;
  state.call.incoming = false;
  state.call.video = video || call.type === 'video';
  state.call.startedAt = 0;
  bindCallListeners(call);
  showCallUI(false);
  try {
    if (state.call.video) await call.placeVideoCall();
    else await call.placeVoiceCall();
  } catch (err) {
    toast(err?.message || 'Не удалось позвонить', 'error');
    closeCallUI();
  }
}

function onIncomingCall(call) {
  if (!call) return;
  if (state.call.call) {
    try { call.reject(); } catch {}
    return;
  }
  state.call.call = call;
  state.call.incoming = true;
  state.call.video = call.type === 'video';
  state.call.startedAt = 0;
  bindCallListeners(call);
  showCallUI(true);
  updateCallUI();
}

async function answerCall() {
  const call = state.call.call;
  if (!call) return;
  stopRingtone();
  state.call.incoming = false;
  $('#call-incoming-actions')?.classList.add('hidden');
  $('#call-controls')?.classList.remove('hidden');
  $('#call-status').textContent = 'Соединяем…';
  try {
    await call.answer(true, state.call.video);
  } catch (err) {
    toast(err?.message || 'Не удалось ответить', 'error');
    closeCallUI();
  }
}

function declineCall() {
  try { state.call.call?.reject(); } catch {}
  closeCallUI();
}

function hangupCall() {
  try { state.call.call?.hangup('user_hangup', false); } catch {}
  closeCallUI();
}

async function toggleCallMic() {
  const call = state.call.call;
  if (!call) return;
  try {
    await call.setMicrophoneMuted(!call.isMicrophoneMuted());
    updateCallFeeds();
  } catch {}
}

async function toggleCallCam() {
  const call = state.call.call;
  if (!call) return;
  try {
    await call.setLocalVideoMuted(!call.isLocalVideoMuted());
    updateCallFeeds();
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   E2EE: devices, trust and SAS verification
   ════════════════════════════════════════════════════════════ */
const PHASE_READY = 3;
const PHASE_STARTED = 4;
const PHASE_CANCELLED = 5;
const PHASE_DONE = 6;

function cryptoApi() {
  return state.client?.getCrypto?.();
}

function deviceTrustLabel(status) {
  if (!status) return 'неизвестно';
  if (status.isVerified?.()) return 'проверено';
  if (status.crossSigningVerified) return 'подписано ключом';
  if (status.signedByOwner) return 'подписано владельцем';
  return 'не проверено';
}

function setVerifyBody(html) {
  const body = $('#verify-body');
  if (body) body.innerHTML = html;
}

function renderVerifyUI() {
  const v = state.verify;
  if (!v.request) {
    setVerifyBody('<div class="bookmark-empty">Нет активной проверки</div>');
    return;
  }
  const phase = v.request.phase;
  if (phase === PHASE_DONE) {
    setVerifyBody(`<div class="verify-done">${icon('check-check')}<p>Проверка успешно завершена.<br>Устройство теперь доверенное.</p></div>`);
    setTimeout(closeModals, 1400);
    return;
  }
  if (phase === PHASE_CANCELLED) {
    setVerifyBody(`<div class="verify-done warn">${icon('alert')}<p>Проверка отменена.</p></div>`);
    setTimeout(closeModals, 1200);
    return;
  }
  if (v.sas) {
    const emojis = v.sas.sas?.emoji || [];
    setVerifyBody(`
      <p class="muted" style="margin-top:0;font-size:0.82rem;">Сравните эмодзи на обоих устройствах. Если они совпадают — подтвердите.</p>
      <div class="sas-grid">${emojis.map(([emoji, name]) => `<div class="sas-cell"><span>${emoji}</span><small>${escapeHtml(name || '')}</small></div>`).join('')}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="sas-mismatch">Не совпадают</button>
        <button class="btn btn-primary" id="sas-confirm">Совпадают</button>
      </div>`);
    $('#sas-confirm').addEventListener('click', () => {
      state.verify.sas?.confirm?.().catch((err) => toast(err?.message || 'Ошибка подтверждения', 'error'));
    });
    $('#sas-mismatch').addEventListener('click', () => {
      state.verify.sas?.mismatch?.();
    });
    return;
  }
  setVerifyBody(`
    <div class="verify-wait">${icon('loader')}<p>Ожидание второй стороны…<br><small>Подтвердите проверку на другом устройстве.</small></p></div>
    <div class="modal-actions"><button class="btn btn-ghost" id="verify-cancel">Отмена</button></div>`);
  $('#verify-cancel').addEventListener('click', cancelVerification);
}

function onVerificationChange() {
  const v = state.verify;
  const request = v.request;
  if (!request) return;
  const phase = request.phase;
  if (phase === PHASE_DONE) {
    toast('Устройство проверено ✓', 'success');
    renderVerifyUI();
    refreshUserTrust(state.currentRoomId ? request.otherUserId : null);
    return;
  }
  if (phase === PHASE_CANCELLED) {
    toast('Проверка отменена', 'info');
    renderVerifyUI();
    return;
  }
  if (phase === PHASE_READY && request.initiatedByMe && !request.verifier && !v.starting) {
    v.starting = true;
    request.startVerification('m.sas.v1')
      .then((verifier) => {
        attachVerifier(verifier);
        return verifier.verify();
      })
      .catch((err) => {
        v.starting = false;
        if (request.phase !== PHASE_CANCELLED && request.phase !== PHASE_DONE) {
          toast(err?.message || 'Не удалось начать проверку', 'error');
        }
      });
    return;
  }
  if (phase === PHASE_STARTED && !v.verifier) {
    const verifier = request.verifier;
    if (verifier) {
      attachVerifier(verifier);
      verifier.verify().catch(() => {});
    }
  }
  renderVerifyUI();
}

function attachVerifier(verifier) {
  state.verify.verifier = verifier;
  verifier.on?.('show_sas', (sas) => {
    state.verify.sas = sas;
    renderVerifyUI();
  });
}

function openVerifyModal(request, user, device) {
  state.verify = { request, verifier: null, sas: null, user, device };
  request.on?.('change', onVerificationChange);
  $('#verify-title').textContent = user === state.userId ? 'Проверка ваших устройств' : `Проверка: ${user || ''}`;
  openModal('verify-modal');
  renderVerifyUI();
}

function cancelVerification() {
  try {
    state.verify.sas?.cancel?.();
  } catch {}
  try {
    state.verify.request?.cancel?.({ code: 'm.user', reason: 'Отменено пользователем' });
  } catch {}
  closeModals();
}

async function beginDeviceVerification(userId, deviceId) {
  const crypto = cryptoApi();
  if (!crypto) {
    toast('Шифрование недоступно на этом устройстве', 'error');
    return;
  }
  try {
    const request = await crypto.requestDeviceVerification(userId, deviceId);
    openVerifyModal(request, userId, deviceId);
  } catch (err) {
    toast(err?.message || 'Не удалось отправить запрос на проверку', 'error');
  }
}

async function beginSelfVerification() {
  const crypto = cryptoApi();
  if (!crypto) {
    toast('Шифрование недоступно на этом устройстве', 'error');
    return;
  }
  try {
    const request = await crypto.requestOwnUserVerification();
    openVerifyModal(request, state.userId, null);
  } catch (err) {
    toast(err?.message || 'Не удалось начать проверку', 'error');
  }
}

async function openDeviceVerify(userId) {
  const crypto = cryptoApi();
  if (!crypto) {
    toast('Шифрование недоступно на этом устройстве', 'error');
    return;
  }
  setVerifyBody('<div class="verify-wait">' + icon('loader') + '<p>Загружаем устройства…</p></div>');
  $('#verify-title').textContent = 'Выбор устройства';
  openModal('verify-modal');
  try {
    const info = await crypto.getUserDeviceInfo([userId], true);
    const devices = Object.values(info?.[userId] || {});
    if (!devices.length) {
      setVerifyBody('<div class="bookmark-empty">Устройства не найдены</div>');
      return;
    }
    const rows = [];
    for (const device of devices) {
      const status = await crypto.getDeviceVerificationStatus(userId, device.deviceId).catch(() => null);
      rows.push(`
        <div class="device-row">
          <span class="device-main"><strong>${escapeHtml(device.displayName || device.deviceId)}</strong><small>${escapeHtml(device.deviceId)} · ${escapeHtml(deviceTrustLabel(status))}</small></span>
          <button class="btn btn-primary btn-sm" data-verify-device="${escapeAttr(device.deviceId)}">Проверить</button>
        </div>`);
    }
    setVerifyBody(rows.join(''));
    $$('#verify-body [data-verify-device]').forEach((btn) => {
      btn.addEventListener('click', () => beginDeviceVerification(userId, btn.dataset.verifyDevice));
    });
  } catch (err) {
    setVerifyBody(`<div class="bookmark-empty">${escapeHtml(err?.message || 'Не удалось загрузить устройства')}</div>`);
  }
}

async function refreshUserTrust(userId) {
  const el = $('#user-trust');
  if (!el || !userId) return;
  const crypto = cryptoApi();
  if (!crypto) {
    el.innerHTML = '';
    return;
  }
  try {
    const userStatus = await crypto.getUserVerificationStatus(userId);
    const info = await crypto.getUserDeviceInfo([userId], false).catch(() => ({}));
    const devices = Object.values(info?.[userId] || {});
    let verified = 0;
    for (const device of devices) {
      const st = await crypto.getDeviceVerificationStatus(userId, device.deviceId).catch(() => null);
      if (st?.isVerified?.()) verified += 1;
    }
    const label = userStatus.isVerified?.()
      ? `<span class="trust-ok">${icon('shield')} Проверен</span>`
      : userStatus.needsUserApproval
        ? '<span class="trust-warn">Идентичность изменилась</span>'
        : '<span class="trust-muted">Не проверен</span>';
    el.innerHTML = `
      <div class="info-row">${icon('shield')}<span>${label}</span><small style="margin-left:auto;">${verified}/${devices.length} устройств</small></div>
      <div class="security-actions" style="margin-top:10px;">
        <button class="btn btn-soft btn-sm" id="user-verify-btn" data-icon="shield">Проверить устройство</button>
        ${userStatus.needsUserApproval ? `<button class="btn btn-ghost btn-sm" id="user-pin-btn">Доверять новой идентичности</button>` : ''}
      </div>`;
    $('#user-verify-btn')?.addEventListener('click', () => openDeviceVerify(userId));
    $('#user-pin-btn')?.addEventListener('click', async () => {
      try {
        await crypto.pinCurrentUserIdentity(userId);
        toast('Идентичность подтверждена', 'success');
        refreshUserTrust(userId);
      } catch (err) {
        toast(err?.message || 'Не удалось подтвердить идентичность', 'error');
      }
    });
  } catch {
    el.innerHTML = '';
  }
}

function refreshSecurityPanel() {
  const status = $('#crypto-status');
  if (!status) return;
  if (state.demo) {
    status.textContent = 'Демо-режим — E2EE не инициализируется';
    status.className = 'crypto-status muted';
    return;
  }
  if (!window.isSecureContext) {
    status.innerHTML = 'E2EE недоступно: нужен HTTPS (или localhost), иначе браузер блокирует WebCrypto.';
    status.className = 'crypto-status error';
    return;
  }
  if (state.cryptoError) {
    status.innerHTML = `E2EE не инициализировано: ${escapeHtml(state.cryptoError)} <button class="link-btn" id="crypto-retry">Повторить</button>`;
    status.className = 'crypto-status error';
    $('#crypto-retry')?.addEventListener('click', retryE2EEInit);
    return;
  }
  if (state.cryptoReady && state.client?.getCrypto?.()) {
    status.textContent = `E2EE активно · устройство ${state.client.getDeviceId() || ''}`;
    status.className = 'crypto-status ok';
  } else {
    status.textContent = 'E2EE пока не инициализировано';
    status.className = 'crypto-status muted';
  }
  refreshBackupStatus();
}

async function refreshBackupStatus() {
  const el = $('#backup-status');
  if (!el) return;
  const crypto = cryptoApi();
  if (!crypto) {
    el.textContent = 'Недоступно без E2EE';
    return;
  }
  try {
    const info = await crypto.getKeyBackupInfo();
    if (!info) {
      el.textContent = 'Резервная копия на сервере не найдена.';
      return;
    }
    const active = await crypto.getActiveSessionBackupVersion().catch(() => null);
    el.textContent = `Версия ${info.version} · ${info.count || 0} ключей · ${active ? 'ключ загружен' : 'ключ не загружен'}`;
  } catch (err) {
    el.textContent = err?.message || 'Не удалось проверить резервную копию';
  }
}

async function restoreKeyBackup() {
  const crypto = cryptoApi();
  if (!crypto) {
    toast('E2EE не инициализировано', 'error');
    return;
  }
  const keyText = $('#backup-key').value.trim();
  if (!keyText) {
    toast('Введите recovery key или используйте Secret Storage', 'info');
    return;
  }
  try {
    const info = await crypto.getKeyBackupInfo();
    if (!info) {
      toast('Резервная копия не найдена', 'error');
      return;
    }
    let raw;
    try {
      raw = decodeRecoveryKey(keyText);
    } catch (err) {
      toast('Неверный recovery key: ' + (err?.message || ''), 'error');
      return;
    }
    await crypto.storeSessionBackupPrivateKey(raw, info.version);
    await restoreBackupInternal();
  } catch (err) {
    toast(err?.message || 'Не удалось восстановить ключи', 'error');
  }
}

async function loadSecretBackupKey() {
  const crypto = cryptoApi();
  if (!crypto) {
    toast('E2EE не инициализировано', 'error');
    return;
  }
  try {
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    toast('Ключ резервной копии загружен из Secret Storage', 'success');
    await refreshBackupStatus();
    await restoreBackupInternal();
  } catch (err) {
    toast(err?.message || 'В Secret Storage нет ключа резервной копии', 'error');
  }
}

async function restoreBackupInternal() {
  const crypto = cryptoApi();
  if (!crypto) return;
  toast('Восстанавливаем ключи… Это может занять время', 'info', 6000);
  try {
    const res = await crypto.restoreKeyBackup({
      progressCallback: (p) => {
        const el = $('#backup-status');
        if (el) el.textContent = `Восстановление: ${p.stages?.done ?? p.imported ?? 0} / ${p.total ?? '?'}`;
      },
    });
    toast(`Ключи восстановлены: ${res.imported} из ${res.total}`, 'success', 5000);
    await refreshBackupStatus();
    retryDecryption();
  } catch (err) {
    toast(err?.message || 'Не удалось восстановить ключи', 'error');
  }
}

async function retryDecryption() {
  const room = getCurrentRoom();
  if (!room || !state.client || state.demo) {
    toast('Откройте комнату для повторной расшифровки', 'info');
    return;
  }
  let count = 0;
  for (const ev of room.timeline || []) {
    if (ev.getType?.() === 'm.room.encrypted' || ev.isEncrypted?.()) {
      count += 1;
      try {
        await state.client.decryptEventIfNeeded(ev, { isRetry: true });
      } catch {}
    }
  }
  renderMessages(false);
  scheduleRooms();
  toast(`Попытка расшифровки: ${count} событий`, 'info', 3000);
}

async function loadMyDevices() {
  const el = $('#devices-body');
  if (!el || !state.client) return;
  el.innerHTML = '<p class="muted">Загрузка устройств…</p>';
  try {
    const { devices } = await state.client.getDevices();
    const crypto = cryptoApi();
    const rows = [];
    for (const device of devices) {
      let trust = '';
      if (crypto) {
        const st = await crypto.getDeviceVerificationStatus(state.userId, device.device_id).catch(() => null);
        trust = st ? deviceTrustLabel(st) : '—';
      }
      const isCurrent = device.device_id === state.client.getDeviceId();
      rows.push(`
        <div class="device-row">
          <span class="device-main">
            <strong>${escapeHtml(device.display_name || device.device_id)}${isCurrent ? ' <em>(это устройство)</em>' : ''}</strong>
            <small>${escapeHtml(device.device_id)} · ${escapeHtml(trust)}${device.last_seen_ts ? ' · видели ' + formatListTime(device.last_seen_ts) : ''}</small>
          </span>
        </div>`);
    }
    el.innerHTML = rows.join('') || '<p class="muted">Устройства не найдены</p>';
    const note = $('#security-note');
    if (note) {
      note.textContent = crypto
        ? 'Совет: проверьте все устройства, чтобы старые зашифрованные сообщения открывались и на них.'
        : 'End-to-end шифрование не инициализировано в этом браузере.';
    }
  } catch (err) {
    el.innerHTML = `<p class="muted">${escapeHtml(err?.message || 'Не удалось загрузить устройства')}</p>`;
  }
}

/* User profile */
async function openUserProfile(userId) {
  if (!userId) return;
  if (userId === state.userId || (state.demo && userId === '@you:matrix.org')) {
    openProfileModal();
    return;
  }
  const body = $('#user-body');
  if (!body) return;
  const room = getCurrentRoom();

  let name = userId;
  let avatarUrl = null;
  let power = null;
  if (state.demo) {
    const member = room?.members?.find((m) => m.id === userId);
    name = member?.name || userId;
  } else if (state.client) {
    try {
      const profile = await state.client.getProfileInfo(userId);
      name = profile?.displayname || userId;
      avatarUrl = profile?.avatar_url || null;
    } catch {}
    const member = room?.getMember?.(userId);
    power = member?.powerLevel ?? null;
  }

  body.innerHTML = `
    <div class="profile-hero">
      ${avatarHtml(name, avatarUrl, 'avatar-72')}
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(userId)}</small>
      ${power !== null ? `<small>Права в комнате: ${power}</small>` : ''}
    </div>
    <div id="user-trust"></div>
    <button class="btn btn-primary btn-block" id="user-dm-btn">${icon('message-plus')} Написать сообщение</button>
    <button class="btn btn-ghost btn-block" id="user-copy-btn" style="margin-top:8px;">${icon('copy')} Скопировать Matrix ID</button>`;
  if (!state.demo) refreshUserTrust(userId);
  openModal('user-modal');

  $('#user-dm-btn').addEventListener('click', () => {
    closeModals();
    startDM(userId);
  });
  $('#user-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(userId);
      toast('Matrix ID скопирован', 'success', 1800);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
  });
}

async function leaveRoom(roomId) {
  if (state.demo) {
    state.demoRooms = state.demoRooms.filter((r) => r.id !== roomId);
    showEmptyState();
    renderRooms();
    closeModals();
    return;
  }
  const ok = await confirmDialog('Покинуть комнату?', 'Вы больше не будете получать сообщения из этой комнаты.', 'Покинуть');
  if (!ok) return;
  try {
    await state.client.leave(roomId);
    closeModals();
    showEmptyState();
    renderRooms();
    toast('Вы покинули комнату', 'success');
  } catch {
    toast('Не удалось покинуть комнату', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   Modals
   ════════════════════════════════════════════════════════════ */
const overlayState = { modalReturnFocus: null, commandReturnFocus: null, callReturnFocus: null };

function getFocusable(root) {
  if (!root) return [];
  return [...root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null && !el.closest('.hidden'));
}

function trapFocus(root, event) {
  if (event.key !== 'Tab') return;
  const items = getFocusable(root);
  if (!items.length) {
    event.preventDefault();
    root.focus?.();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function updateBackgroundInert() {
  const app = $('#app-view');
  if (!app) return;
  const overlayOpen =
    !$('#modal-backdrop')?.classList.contains('hidden') ||
    !$('#command-palette')?.classList.contains('hidden') ||
    !$('#call-backdrop')?.classList.contains('hidden');
  if ('inert' in app) app.inert = overlayOpen;
}

function modalTrapHandler(event) {
  if (event.key !== 'Tab') return;
  const modal = $('#modal-backdrop .modal:not(.hidden)');
  if (modal) trapFocus(modal, event);
}

function openModal(id) {
  const backdrop = $('#modal-backdrop');
  if (backdrop.classList.contains('hidden')) {
    overlayState.modalReturnFocus = document.activeElement;
    document.addEventListener('keydown', modalTrapHandler);
  }
  backdrop.classList.remove('hidden');
  $$('.modal', backdrop).forEach((m) => m.classList.add('hidden'));
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  updateBackgroundInert();
  setTimeout(() => {
    const target = document.getElementById(id);
    const focusable = getFocusable(target);
    (focusable[0] || target)?.focus?.();
  }, 60);
}

function closeModals() {
  const wasOpen = !$('#modal-backdrop')?.classList.contains('hidden');
  $('#modal-backdrop')?.classList.add('hidden');
  $$('.modal').forEach((m) => m.classList.add('hidden'));
  const emoji = $('#emoji-pop');
  emoji?.classList.add('hidden');
  document.body.classList.remove('modal-open');
  updateBackgroundInert();
  if (wasOpen) {
    document.removeEventListener('keydown', modalTrapHandler);
    if (overlayState.modalReturnFocus?.isConnected) overlayState.modalReturnFocus.focus?.();
    overlayState.modalReturnFocus = null;
  }
}

function openSecuritySettings() {
  openSettings();
  setTimeout(() => {
    $('#crypto-status')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
}

function openSettings() {
  const displayName = state.profile.displayName || (state.demo ? 'Гость' : 'Вы');
  $('#settings-name').textContent = displayName;
  $('#settings-id').textContent = state.userId || '@you:matrix.org';
  const nameInput = $('#display-name');
  if (nameInput) nameInput.value = displayName;
  const settingsAvatar = $('#settings-avatar');
  if (settingsAvatar) {
    settingsAvatar.outerHTML = avatarHtml(displayName, state.profile.avatarUrl, 'avatar-56').replace(
      '<span class="avatar avatar-56"',
      '<span id="settings-avatar" class="avatar avatar-56"'
    );
  }
  const status = $('#client-status');
  if (status) {
    status.textContent = state.demo
      ? 'Демо-режим · данные не отправляются на сервер'
      : state.client?.getCrypto?.()
        ? 'End-to-end шифрование активно'
        : 'E2EE недоступно в этом браузере — encrypted-комнаты могут не расшифровываться';
  }
  applyTheme();
  applyAccent();
  $('#sound-toggle').checked = state.prefs.sound;
  $('#notify-toggle').checked = state.prefs.notify;
  refreshSecurityPanel();
  if (!state.demo) {
    loadMyDevices();
    refreshBackupStatus();
  } else {
    $('#devices-body').innerHTML = '<p class="muted">Демо-режим — устройства не загружаются</p>';
    $('#backup-status').textContent = 'Демо-режим — резервная копия недоступна';
  }
  openModal('settings-modal');
}

function openNewRoom() {
  $('#new-room-error').textContent = '';
  $$('#new-room-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'create'));
  $('#tab-create').classList.remove('hidden');
  $('#tab-join').classList.add('hidden');
  $('#tab-dm').classList.add('hidden');
  openModal('new-room-modal');
}

function openRoomInfo() {
  const room = getCurrentRoom();
  if (!room) return;

  if (state.demo) {
    $('#room-info-body').innerHTML = `
      <div class="profile-hero">
        ${avatarHtml(room.name, null, 'avatar-72')}
        <strong>${escapeHtml(room.name)}</strong>
        <small>${escapeHtml(room.topic)}</small>
      </div>
      <div class="info-list">
        <div class="info-row">${icon('hash')}<span>${escapeHtml(room.id)}</span></div>
        <div class="info-row">${icon('users')}<span>${room.members.length} участников</span></div>
      </div>
      <div class="member-list">${room.members.map((m) => `
        <div class="member-row" data-member="${escapeAttr(m.id)}" role="button" tabindex="0">${avatarHtml(m.name)}<span>${escapeHtml(m.name)}</span><small>${m.power >= 100 ? 'Админ' : ''}</small></div>`).join('')}</div>
      <div class="settings-label">Уведомления</div>
      <div class="segmented" id="room-notif-seg" role="group" aria-label="Уведомления">
        <button data-notif="all" class="active">Все</button>
        <button data-notif="mention">Упоминания</button>
        <button data-notif="mute">Выкл</button>
      </div>
      <div class="settings-label">Пригласить пользователя</div>
      <div class="invite-row"><input id="invite-user" type="text" placeholder="@user:matrix.org" /><button class="btn btn-soft btn-sm" id="invite-btn">Пригласить</button></div>
      ${canEditRoom(room) ? `<button class="btn btn-soft btn-block" style="margin-top:16px;" id="open-room-settings">${icon('settings')} Настройки комнаты</button>` : ''}
      <button class="btn btn-danger-soft btn-block" style="margin-top:8px;" data-leave-room="${escapeAttr(room.id)}">${icon('logout')} Покинуть комнату</button>`;
  } else {
    const name = roomName(room);
    const alias = room.getCanonicalAlias?.() || '';
    const topic = room.getTopic?.() || 'Без темы';
    const members = room.getJoinedMembers?.() || [];
    const myMember = room.getMember?.(state.userId);
    const canLeave = myMember?.membership === 'join';
    $('#room-info-body').innerHTML = `
      <div class="profile-hero">
        ${avatarHtml(name, roomAvatarMxc(room), 'avatar-72')}
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(topic)}</small>
      </div>
      <div class="info-list">
        ${alias ? `<div class="info-row">${icon('link')}<span>${escapeHtml(alias)}</span></div>` : ''}
        <div class="info-row">${icon('hash')}<span>${escapeHtml(room.roomId)}</span></div>
        <div class="info-row">${icon('users')}<span>${members.length} участников</span></div>
      </div>
      <div class="settings-label">Участники</div>
      <div class="member-list">
        ${members.slice(0, 80).map((m) => `
          <div class="member-row" data-member="${escapeAttr(m.userId)}" role="button" tabindex="0">${avatarHtml(m.name, m.getAvatarUrl?.(state.client.getHomeserverUrl(), 64, 64, 'crop'))}
          <span>${escapeHtml(m.name)}${m.userId === state.userId ? ' (вы)' : ''}</span><small>${m.powerLevel >= 100 ? 'Админ' : ''}</small></div>`).join('')}
      </div>
      <div class="settings-label">Уведомления</div>
      <div class="segmented" id="room-notif-seg" role="group" aria-label="Уведомления">
        <button data-notif="all" class="active">Все</button>
        <button data-notif="mention">Упоминания</button>
        <button data-notif="mute">Выкл</button>
      </div>
      <div class="settings-label">Пригласить пользователя</div>
      <div class="invite-row"><input id="invite-user" type="text" placeholder="@user:matrix.org" /><button class="btn btn-soft btn-sm" id="invite-btn">Пригласить</button></div>
      ${canEditRoom(room) ? `<button class="btn btn-soft btn-block" style="margin-top:16px;" id="open-room-settings">${icon('settings')} Настройки комнаты</button>` : ''}
      ${canLeave ? `<button class="btn btn-danger-soft btn-block" style="margin-top:8px;" data-leave-room="${escapeAttr(room.roomId)}">${icon('logout')} Покинуть комнату</button>` : ''}`;
  }
  updateNotifSeg();
  openModal('room-info-modal');
}

function openProfileModal() {
  const name = state.profile.displayName || 'Вы';
  const id = state.userId || '@you:matrix.org';
  const rooms = state.demo ? state.demoRooms.length : clientRooms().length;
  const joinedRooms = state.demo ? rooms : clientRooms().filter((r) => r.getMyMembership?.() === 'join').length;
  $('#profile-body').innerHTML = `
    <div class="profile-hero">
      ${avatarHtml(name, state.profile.avatarUrl, 'avatar-72')}
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(id)}</small>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><strong>${rooms}</strong><small>комнат</small></div>
      <div class="profile-stat"><strong>${joinedRooms}</strong><small>активных</small></div>
    </div>
    <div class="info-list">
      <div class="info-row">${icon('shield')}<span>Клиент mst.matrix</span></div>
      <div class="info-row">${icon('server')}<span>${escapeHtml(state.demo ? 'Демо-режим' : state.client?.getHomeserverUrl() || '')}</span></div>
      ${!state.demo ? `<div class="info-row">${icon('monitor')}<span>Устройство ${escapeHtml(state.client?.getDeviceId() || '—')}</span></div>` : ''}
    </div>
    <button class="btn btn-soft btn-block" style="margin-top:16px;" id="copy-user-id">${icon('copy')} Скопировать Matrix ID</button>`;
  openModal('profile-modal');
  $('#copy-user-id')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast('Matrix ID скопирован', 'success', 1800);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
  });
}

/* ════════════════════════════════════════════════════════════
   Command palette, focus mode, recap
   ════════════════════════════════════════════════════════════ */
function commandRooms() {
  if (state.demo) {
    return state.demoRooms.map((room) => ({
      icon: 'hash',
      title: room.name,
      subtitle: 'Перейти в комнату',
      keywords: room.name,
      run: () => selectRoom(room.id),
    }));
  }
  return clientRooms().map((room) => ({
    icon: 'hash',
    title: roomName(room),
    subtitle: room.getTopic?.() || 'Перейти в комнату',
    keywords: `${roomName(room)} ${room.roomId}`,
    run: () => selectRoom(room.roomId),
  }));
}

function allCommands() {
  return [
    {
      icon: 'message-plus',
      title: 'Новая комната',
      subtitle: 'Создать комнату или войти по адресу',
      keywords: 'создать новую комнату join',
      run: openNewRoom,
    },
    {
      icon: 'phone',
      title: 'Аудиозвонок',
      subtitle: 'Позвонить в текущую комнату',
      keywords: 'звонок call voice аудио',
      run: () => startCall(false),
    },
    {
      icon: 'video',
      title: 'Видеозвонок',
      subtitle: 'Видеозвонок в текущую комнату',
      keywords: 'звонок call video видео',
      run: () => startCall(true),
    },
    {
      icon: 'compass',
      title: 'Директория комнат',
      subtitle: 'Публичные комнаты homeserver’а',
      keywords: 'директория комнаты public explore',
      run: openDirectory,
    },
    {
      icon: 'key',
      title: 'Восстановить ключи E2EE',
      subtitle: 'Резервная копия, Secret Storage, расшифровка',
      keywords: 'e2ee ключи backup security',
      run: openSecuritySettings,
    },
    {
      icon: 'search',
      title: 'Глобальный поиск',
      subtitle: 'Сообщения, комнаты и люди',
      keywords: 'поиск search найти',
      run: openGlobalSearch,
    },
    {
      icon: 'settings',
      title: 'Настройки комнаты',
      subtitle: 'Имя, тема, аватар, алиасы',
      keywords: 'настройки комнаты room settings',
      run: openRoomSettings,
    },
    {
      icon: 'bookmark',
      title: 'Сохранённые сообщения',
      subtitle: 'Локальное избранное',
      keywords: 'закладки избранное saved',
      run: openBookmarks,
    },
    {
      icon: 'sparkles',
      title: 'Сводка непрочитанного',
      subtitle: 'Быстрый обзор активных комнат',
      keywords: 'recap сводка непрочитанное',
      run: openRecap,
    },
    {
      icon: 'focus',
      title: state.focusMode ? 'Выйти из режима фокуса' : 'Режим фокуса',
      subtitle: 'Скрыть всё лишнее и сосредоточиться на переписке',
      keywords: 'focus фокус zen',
      run: toggleFocusMode,
    },
    {
      icon: 'settings',
      title: 'Настройки',
      subtitle: 'Тема, акценты, уведомления',
      keywords: 'настройки theme',
      run: openSettings,
    },
    {
      icon: 'moon',
      title: 'Тёмная тема',
      subtitle: 'Включить тёмное оформление',
      keywords: 'dark theme ночь',
      run: () => { state.prefs.theme = 'dark'; applyTheme(); savePrefs(); },
    },
    {
      icon: 'sun',
      title: 'Светлая тема',
      subtitle: 'Включить светлое оформление',
      keywords: 'light theme день',
      run: () => { state.prefs.theme = 'light'; applyTheme(); savePrefs(); },
    },
    {
      icon: 'at',
      title: 'Мой профиль',
      subtitle: state.userId || 'Matrix ID',
      keywords: 'профиль аккаунт',
      run: openProfileModal,
    },
    {
      icon: 'logout',
      title: 'Выйти из аккаунта',
      subtitle: 'Завершить сессию на этом устройстве',
      keywords: 'logout выход',
      run: logout,
    },
    ...commandRooms(),
  ];
}

function openCommandPalette() {
  const palette = $('#command-palette');
  if (!palette) return;
  if (palette.classList.contains('hidden')) overlayState.commandReturnFocus = document.activeElement;
  palette.classList.remove('hidden');
  updateBackgroundInert();
  const input = $('#command-input');
  if (input) {
    input.value = '';
    input.setAttribute('aria-expanded', 'true');
    renderCommands('');
    setTimeout(() => input.focus(), 30);
  }
}

function closeCommandPalette() {
  const palette = $('#command-palette');
  if (!palette || palette.classList.contains('hidden')) return;
  palette.classList.add('hidden');
  $('#command-input')?.setAttribute('aria-expanded', 'false');
  updateBackgroundInert();
  if (overlayState.commandReturnFocus?.isConnected) overlayState.commandReturnFocus.focus?.();
  overlayState.commandReturnFocus = null;
}

function renderCommands(query = '') {
  const q = query.trim().toLowerCase();
  const items = allCommands().filter((cmd) => {
    if (!q) return true;
    return `${cmd.title} ${cmd.subtitle || ''} ${cmd.keywords || ''}`.toLowerCase().includes(q);
  }).slice(0, 30);

  state.commandItems = items;
  state.commandIndex = 0;

  const results = $('#command-results');
  if (!results) return;
  if (!items.length) {
    results.innerHTML = '<div class="command-empty">Ничего не найдено</div>';
    return;
  }
  results.innerHTML = items.map((cmd, i) => `
    <button class="command-item ${i === 0 ? 'active' : ''}" id="cmd-item-${i}" role="option" aria-selected="${i === 0}" data-command-index="${i}">
      <span class="cmd-ico">${icon(cmd.icon || 'command')}</span>
      <span class="cmd-text"><strong>${escapeHtml(cmd.title)}</strong><small>${escapeHtml(cmd.subtitle || '')}</small></span>
    </button>`).join('');
  $('#command-input')?.setAttribute('aria-activedescendant', 'cmd-item-0');
}

function selectCommand(index) {
  const item = state.commandItems[index];
  if (!item) return;
  closeCommandPalette();
  setTimeout(() => item.run(), 20);
}

function moveCommand(delta) {
  if (!state.commandItems.length) return;
  state.commandIndex = (state.commandIndex + delta + state.commandItems.length) % state.commandItems.length;
  $$('#command-results .command-item').forEach((el, i) => {
    el.classList.toggle('active', i === state.commandIndex);
    el.setAttribute('aria-selected', String(i === state.commandIndex));
  });
  const active = $('#command-results .command-item.active');
  active?.scrollIntoView({ block: 'nearest' });
  if (active) $('#command-input')?.setAttribute('aria-activedescendant', active.id);
}

function enterFocusMode() {
  state.focusMode = true;
  $('#app-view')?.classList.add('focus-mode');
  $('#focus-exit')?.classList.remove('hidden');
  closeSidebar();
}

function exitFocusMode() {
  if (!state.focusMode) return;
  state.focusMode = false;
  $('#app-view')?.classList.remove('focus-mode');
  $('#focus-exit')?.classList.add('hidden');
}

function toggleFocusMode() {
  if (state.focusMode) exitFocusMode();
  else enterFocusMode();
}

function openRecap() {
  const rows = [];
  if (state.demo) {
    for (const room of state.demoRooms) {
      if (!room.unread) continue;
      const last = room.messages[room.messages.length - 1];
      rows.push({
        id: room.id,
        name: room.name,
        count: room.unread,
        text: last ? last.body : 'Нет сообщений',
        time: last ? formatListTime(last.ts) : '',
      });
    }
  } else {
    for (const room of clientRooms()) {
      const unread = unreadFor(room);
      if (!unread.total) continue;
      const p = roomPreview(room);
      rows.push({
        id: room.roomId,
        name: roomName(room),
        count: unread.total,
        text: p.text,
        time: formatListTime(p.ts),
      });
    }
  }

  const body = $('#recap-body');
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<div class="bookmark-empty">${icon('check-check')}<p style="margin-top:10px;">Всё прочитано — непрочитанных комнат нет.</p></div>`;
  } else {
    rows.sort((a, b) => b.count - a.count);
    body.innerHTML = rows.map((r) => `
      <button class="recap-room" data-recap-room="${escapeAttr(r.id)}" style="border:0;background:transparent;text-align:left;width:100%;">
        ${avatarHtml(r.name)}
        <span class="recap-main"><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.time)}</small><p>${escapeHtml(r.text)}</p></span>
        <span class="recap-badge">${r.count > 99 ? '99+' : r.count}</span>
      </button>`).join('');
  }
  openModal('recap-modal');
}

/* ════════════════════════════════════════════════════════════
   Sidebar mobile
   ════════════════════════════════════════════════════════════ */
function sidebarIsMobile() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function syncSidebarA11y(open = null) {
  const sidebar = $('#sidebar');
  const app = $('#app-view');
  if (!sidebar || !app) return;
  const isOpen = open ?? app.classList.contains('sidebar-open');
  if (sidebarIsMobile()) {
    sidebar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    sidebar.inert = !isOpen;
  } else {
    sidebar.setAttribute('aria-hidden', 'false');
    sidebar.inert = false;
  }
}

function openSidebar() {
  $('#app-view')?.classList.add('sidebar-open');
  syncSidebarA11y(true);
  setTimeout(() => $('#sidebar-close-btn')?.focus(), 60);
}

function closeSidebar() {
  $('#app-view')?.classList.remove('sidebar-open');
  syncSidebarA11y(false);
}

/* ════════════════════════════════════════════════════════════
   Demo mode
   ════════════════════════════════════════════════════════════ */
function buildDemoData() {
  const now = Date.now();
  const min = 60 * 1000;
  const day = 24 * 60 * min;

  state.demoRooms = [
    {
      id: '!design:matrix.org',
      name: 'Design Crew',
      topic: 'Продуктовый дизайн и интерфейсы',
      unread: 3,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 100 },
        { name: 'Алина Морозова', id: '@alina:matrix.org', power: 50 },
        { name: 'Максим Волков', id: '@max:matrix.org', power: 0 },
        { name: 'Nikita', id: '@nikita:matrix.org', power: 0 },
      ],
      messages: [
        { id: 'd1', sender: '@alina:matrix.org', name: 'Алина Морозова', ts: now - 2 * day, body: 'Привет! Собрала первые макеты нового мессенджера. Хочу показать вам направление.', isOwn: false, reactions: {} },
        { id: 'd2', sender: '@max:matrix.org', name: 'Максим Волков', ts: now - 2 * day + 4 * min, body: 'Круто! Особенно нравится, как получились пузыри сообщений и цветовая система.', isOwn: false, reactions: { '🔥': { count: 2, mine: false }, '👍': { count: 1, mine: true } } },
        { id: 'd3', sender: '@you:matrix.org', name: 'Вы', ts: now - 2 * day + 9 * min, body: 'Согласен. Давайте только сделаем акцент на читаемости и добавим больше воздуха в списке чатов.', isOwn: true, reactions: {} },
        { id: 'd4', sender: '@nikita:matrix.org', name: 'Nikita', ts: now - day - 40 * min, body: 'Я подготовил прототип тёмной темы. Выглядит очень мягко — без чистого чёрного.', isOwn: false, reactions: {} },
        { id: 'd4a', sender: '@alina:matrix.org', name: 'Алина Морозова', ts: now - day - 32 * min, body: 'Голосовое сообщение', msgtype: 'm.audio', isOwn: false, reactions: {}, content: { msgtype: 'm.audio', body: 'Голосовое сообщение', url: DEMO_AUDIO, info: { mimetype: 'audio/wav', duration: 1250, size: 10000 }, 'org.matrix.msc3245.voice': {} } },
        { id: 'd5', sender: '@alina:matrix.org', name: 'Алина Морозова', ts: now - 55 * min, body: 'Отлично! К вечеру соберу финальную версию и закину в Figma. Нужно ещё проверить мобильную версию.', isOwn: false, reactions: { '❤️': { count: 3, mine: true } } },
        { id: 'd6', sender: '@you:matrix.org', name: 'Вы', ts: now - 18 * min, body: 'Супер. Я как раз доделал адаптив — на телефоне сайдбар уезжает, а композер остаётся внизу. Попробуй!', isOwn: true, reactions: { '🎉': { count: 2, mine: false } } },
      ],
    },
    {
      id: '!matrix:matrix.org',
      name: 'Matrix Community',
      topic: 'Официальное сообщество Matrix',
      unread: 12,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 0 },
        { name: 'Sarah', id: '@sarah:matrix.org', power: 100 },
        { name: 'devnull', id: '@devnull:matrix.org', power: 50 },
      ],
      messages: [
        { id: 'm1', sender: '@sarah:matrix.org', name: 'Sarah', ts: now - 3 * day, body: 'Matrix 1.12 уже здесь! Улучшенная аутентификация медиа и новые возможности для клиентов.', isOwn: false, reactions: { '🚀': { count: 8, mine: true } } },
        { id: 'm2', sender: '@devnull:matrix.org', name: 'devnull', ts: now - 2 * day, body: 'Кто-нибудь уже тестировал authenticated media? Интересно, как это влияет на старые клиенты.', isOwn: false, reactions: {} },
        { id: 'm3', sender: '@you:matrix.org', name: 'Вы', ts: now - day, body: 'Да, в mst.matrix добавил поддержку. Работает заметно стабильнее.', isOwn: true, reactions: {} },
      ],
    },
    {
      id: '!aurora:matrix.org',
      name: 'Проект «Аврора»',
      topic: 'Внутренний проект · Q4',
      unread: 0,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 100 },
        { name: 'Ольга', id: '@olga:matrix.org', power: 50 },
      ],
      messages: [
        { id: 'a1', sender: '@olga:matrix.org', name: 'Ольга', ts: now - 5 * day, body: 'Добавила тесты для синхронизации. Покрытие выросло до 87%.', isOwn: false, reactions: { '✅': { count: 1, mine: false } } },
        { id: 'a2', sender: '@you:matrix.org', name: 'Вы', ts: now - 4 * day, body: 'Отлично, спасибо! Осталось проверить обработку ошибок при потере сети.', isOwn: true, reactions: {} },
      ],
    },
    {
      id: '!sophia:matrix.org',
      name: 'София',
      topic: 'Личные сообщения',
      unread: 1,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 0 },
        { name: 'София', id: '@sophia:matrix.org', power: 0 },
      ],
      messages: [
        { id: 's1', sender: '@sophia:matrix.org', name: 'София', ts: now - 35 * min, body: 'Привет! Посмотрела клиент — выглядит правда современно. Особенно понравилась тёмная тема ✨', isOwn: false, reactions: {} },
        { id: 's2', sender: '@you:matrix.org', name: 'Вы', ts: now - 30 * min, body: 'Спасибо! Ещё добавил акцентные цвета и настройки профиля.', isOwn: true, reactions: { '😊': { count: 1, mine: false } } },
        { id: 's3', sender: '@sophia:matrix.org', name: 'София', ts: now - 12 * min, body: 'Класс. А можно как-то попробовать без аккаунта?', isOwn: false, reactions: {} },
      ],
    },
  ];

  state.demoSpaces = [
    {
      id: '!space:matrix.org',
      name: 'Matrix-пространство',
      children: [
        { id: '!design:matrix.org', name: 'Design Crew', topic: 'Продуктовый дизайн и интерфейсы' },
        { id: '!demo-space-child:matrix.org', name: 'Технологии и код', topic: 'Разработка и инструменты' },
      ],
    },
  ];

  state.profile = { displayName: 'Вы', avatarUrl: null };
  state.userId = '@you:matrix.org';
  state.demo = true;
}

function enterDemo() {
  document.body.classList.remove('auth-mode');
  buildDemoData();
  document.documentElement.dataset.demo = 'true';
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#my-name').textContent = 'Вы';
  $('#my-id').textContent = '@you:matrix.org';
  const myAvatar = $('#my-avatar');
  if (myAvatar) myAvatar.outerHTML = avatarHtml('Вы', null, 'avatar-36').replace(
    '<span class="avatar avatar-36"',
    '<span id="my-avatar" class="avatar avatar-36"'
  );
  $('#call-voice-btn')?.classList.add('hidden');
  $('#call-video-btn')?.classList.add('hidden');
  renderRooms();
  selectRoom(state.demoRooms[0].id);
  toast('Демо-режим: интерфейс без подключения к серверу', 'info', 5000);
}

function exitDemo() {
  closeModals();
  closeCommandPalette();
  closeSidebar();
  exitFocusMode();
  if (state.call.call) {
    try { state.call.call.hangup('user_hangup', false); } catch {}
    closeCallUI();
  }
  document.body.classList.add('auth-mode');
  state.demo = false;
  state.demoRooms = [];
  state.currentRoomId = null;
  document.title = 'mst.matrix — Matrix, beautifully';
  location.hash = '';
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════
   Logout
   ════════════════════════════════════════════════════════════ */
async function logout() {
  if (state.voice.recorder?.state === 'recording') finishVoiceRecording(false);
  if (state.call.call) {
    try { state.call.call.hangup('user_hangup', false); } catch {}
    closeCallUI();
  }
  if (state.demo) {
    exitDemo();
    return;
  }
  const ok = await confirmDialog('Выйти из аккаунта?', 'Сессия будет завершена на этом устройстве.', 'Выйти');
  if (!ok) return;

  clearReadReceiptTimers();
  try { await state.client?.logout(true); } catch {}
  try { state.client?.stopClient(); } catch {}
  clearSession();
  state.client = null;
  state.userId = null;
  state.currentRoomId = null;
  state.profile = { displayName: '', avatarUrl: null };
  state.typing = {};
  closeModals();
  showAuth();
  toast('Вы вышли из аккаунта', 'info');
}

function clearReadReceiptTimers() {
  Object.values(state.readReceiptTimers || {}).forEach((timer) => clearTimeout(timer));
  state.readReceiptTimers = {};
}

function showAuth() {
  document.body.classList.add('auth-mode');
  clearReadReceiptTimers();
  if (state.call.call) {
    try { state.call.call.hangup('user_hangup', false); } catch {}
    closeCallUI();
  }
  document.title = 'mst.matrix — Matrix, beautifully';
  exitFocusMode();
  closeCommandPalette();
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  $('#password').value = '';
  $('#login-error').textContent = '';
  state.currentRoomId = null;
  $('#chat-view').classList.add('hidden');
  $('#empty-state').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════
   Event bindings
   ════════════════════════════════════════════════════════════ */
function bindEvents() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#sso-btn').addEventListener('click', startSsoLogin);

  $('#toggle-password').addEventListener('click', () => {
    const input = $('#password');
    const btn = $('#toggle-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    setIcon(btn, show ? 'eye-off' : 'eye');
    btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  $('#logout-btn').addEventListener('click', logout);
  $('#logout-btn-2').addEventListener('click', logout);
  $('#pinned-label').addEventListener('click', openPinnedModal);
  $('#pinned-body').addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-pinned-remove]');
    if (remove) {
      await togglePin({ id: remove.dataset.pinnedRemove });
      openPinnedModal();
      return;
    }
    const jump = e.target.closest('[data-pinned-jump]');
    if (jump) jumpToBookmark(jump.dataset.pinnedJump, state.currentRoomId);
  });
  $('#palette-btn').addEventListener('click', openCommandPalette);
  $('#bookmarks-btn').addEventListener('click', openBookmarks);
  $('#focus-btn').addEventListener('click', toggleFocusMode);
  $('#focus-exit').addEventListener('click', exitFocusMode);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#empty-settings-btn').addEventListener('click', openSettings);
  $('#profile-btn').addEventListener('click', openProfileModal);

  $('#new-room-btn').addEventListener('click', openNewRoom);
  $('#empty-new-room').addEventListener('click', () => {
    if (state.roomFilter) {
      state.roomFilter = '';
      const search = $('#room-search');
      if (search) search.value = '';
      renderRooms();
    } else {
      openNewRoom();
    }
  });
  $('#empty-new-room-2').addEventListener('click', openNewRoom);

  $('#room-search').addEventListener('input', (e) => {
    state.roomFilter = e.target.value;
    renderRooms();
  });

  $('#room-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-room-id]');
    if (item) selectRoom(item.dataset.roomId);
  });

  document.addEventListener('keydown', (e) => {
    const profileTarget = e.target.closest?.('[data-user-id][role="button"], [data-member][role="button"]');
    if (profileTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openUserProfile(profileTarget.dataset.userId || profileTarget.dataset.member);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      if (!$('#app-view')?.classList.contains('hidden')) {
        e.preventDefault();
        openGlobalSearch();
      }
    }
    if (e.key === 'Escape') {
      const overlayOpen =
        !$('#modal-backdrop')?.classList.contains('hidden') ||
        !$('#command-palette')?.classList.contains('hidden') ||
        !$('#emoji-pop')?.classList.contains('hidden') ||
        !$('#call-backdrop')?.classList.contains('hidden') ||
        !$('#lightbox')?.classList.contains('hidden');
      closeCommandPalette();
      if (state.voice.recorder?.state === 'recording') finishVoiceRecording(false);
      closeModals();
      closeLightbox();
      $('#emoji-pop')?.classList.add('hidden');
      closeSidebar();
      if (!overlayOpen) exitFocusMode();
    }
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
    if (e.key.toLowerCase() === 'f' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleFocusMode();
    }
  });

  // Sidebar / mobile
  $('#menu-btn').addEventListener('click', openSidebar);
  $('#sidebar-close-btn').addEventListener('click', closeSidebar);
  $('#sidebar-scrim').addEventListener('click', closeSidebar);
  window.addEventListener('resize', () => syncSidebarA11y());

  // Header
  $('#chat-search-btn').addEventListener('click', () => {
    const bar = $('#chat-search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) $('#chat-search').focus();
    else {
      $('#chat-search').value = '';
      state.messageFilter = '';
      renderMessages(false);
    }
  });
  $('#chat-search-close').addEventListener('click', () => {
    $('#chat-search-bar').classList.add('hidden');
    $('#chat-search').value = '';
    state.messageFilter = '';
    renderMessages(false);
  });
  $('#chat-search').addEventListener('input', (e) => {
    state.messageFilter = e.target.value.trim();
    renderMessages(false);
  });
  $('#room-info-btn').addEventListener('click', openRoomInfo);
  $('#room-info-btn-2').addEventListener('click', openRoomInfo);

  // Composer
  $('#message-input').addEventListener('input', () => {
    resizeComposer();
    sendTypingState();
    scheduleMentions();
    if (state.currentRoomId) {
      const value = $('#message-input').value;
      if (value.trim()) state.drafts[state.currentRoomId] = value;
      else delete state.drafts[state.currentRoomId];
      clearTimeout(state.draftTimer);
      state.draftTimer = setTimeout(saveDrafts, 400);
    }
  });
  $('#message-input').addEventListener('keydown', (e) => {
    if (mentionState.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMention(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMention(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = mentionState.items[mentionState.index];
        if (item) selectMention(item.id);
        return;
      }
      if (e.key === 'Escape') { closeMentionPop(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  function applyMd(action) {
    const ta = $('#message-input');
    if (!ta) return;
    const value = ta.value;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    let sel = value.slice(start, end);
    let rep = '';
    let selStart = start;
    let selLen = 0;
    const placeholder = 'текст';
    const inner = sel || placeholder;

    switch (action) {
      case 'bold':
        rep = `**${inner}**`;
        selLen = inner.length;
        break;
      case 'italic':
        rep = `*${inner}*`;
        selLen = inner.length;
        break;
      case 'strike':
        rep = `~~${inner}~~`;
        selLen = inner.length;
        break;
      case 'code':
        if (sel.includes('\n')) {
          rep = '```\n' + sel + '\n```';
          selLen = rep.length;
        } else {
          rep = `\`${inner}\``;
          selLen = inner.length;
        }
        break;
      case 'quote': {
        const lines = sel.split('\n').map((line) => `> ${line}`).join('\n');
        rep = lines;
        selLen = lines.length;
        break;
      }
      case 'list': {
        const lines = sel.split('\n').map((line) => `- ${line}`).join('\n');
        rep = lines;
        selLen = lines.length;
        break;
      }
      case 'link': {
        const url = 'https://';
        rep = `[${inner}](${url})`;
        selStart = start + `[${inner}](`.length;
        selLen = url.length;
        break;
      }
      default:
        return;
    }

    ta.value = value.slice(0, start) + rep + value.slice(end);
    if (!sel) {
      const offset = rep.indexOf(placeholder);
      if (offset !== -1 && action !== 'link') {
        selStart = start + offset;
        selLen = placeholder.length;
      } else {
        selStart = start + rep.length;
        selLen = 0;
      }
    }
    ta.selectionStart = selStart;
    ta.selectionEnd = selStart + selLen;
    ta.focus();
    resizeComposer();
    sendTypingState();
    if (state.currentRoomId) {
      const v = ta.value;
      if (v.trim()) state.drafts[state.currentRoomId] = v;
      else delete state.drafts[state.currentRoomId];
      clearTimeout(state.draftTimer);
      state.draftTimer = setTimeout(saveDrafts, 400);
    }
  }

  $('#md-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-md]');
    if (btn) applyMd(btn.dataset.md);
  });
  $('#poll-btn').addEventListener('click', openPollModal);
  $('#poll-submit').addEventListener('click', createPoll);

  $('#message-input').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) {
      e.preventDefault();
      applyMd(e.key.toLowerCase() === 'b' ? 'bold' : 'italic');
    }
  });

  $('#send-btn').addEventListener('click', sendMessage);

  $('#voice-btn').addEventListener('click', toggleVoiceRecording);
  $('#voice-cancel').addEventListener('click', () => finishVoiceRecording(false));
  $('#voice-send').addEventListener('click', () => finishVoiceRecording(true));

  $('#attach-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    const files = [...e.target.files];
    state.pendingFiles.push(...files);
    e.target.value = '';
    renderFilePreview();
    updateSendButton();
    $('#message-input').focus();
  });

  $('#emoji-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker(e.currentTarget);
  });

  // File preview removal
  $('#file-preview').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-file]');
    if (!btn) return;
    state.pendingFiles.splice(Number(btn.dataset.removeFile), 1);
    renderFilePreview();
    updateSendButton();
  });

  // Infinite scrollback
  $('#message-scroll').addEventListener('scroll', () => {
    const el = $('#message-scroll');
    if (el && el.scrollTop < 80) loadOlderMessages();
  });

  // Messages
  $('#messages').addEventListener('click', async (e) => {
    if (window.matchMedia('(hover: none)').matches) {
      const msg = e.target.closest('.msg');
      if (msg && !e.target.closest('.msg-tools') && !e.target.closest('[data-action]') && !e.target.closest('[data-user-id]') && !e.target.closest('[data-audio-download]') && !e.target.closest('[data-file-event]') && !e.target.closest('.audio-play') && !e.target.closest('.audio-speed') && !e.target.closest('.audio-wave')) {
        $$('.msg.tools-open').forEach((m) => { if (m !== msg) m.classList.remove('tools-open'); });
        msg.classList.toggle('tools-open');
      }
    }

    if (e.target.closest('[data-action="open-security"]')) {
      openSecuritySettings();
      return;
    }
    const userEl = e.target.closest('[data-user-id]');
    if (userEl && !e.target.closest('.msg-tools')) {
      openUserProfile(userEl.dataset.userId);
      return;
    }

    const fileBtn = e.target.closest('[data-file-event]');
    if (fileBtn && !e.target.closest('[data-action]')) {
      e.preventDefault();
      const content = state.messageContent.get(fileBtn.dataset.fileEvent);
      if (content) {
        try {
          await downloadAttachment(content, content.body || 'file');
        } catch {
          toast('Не удалось скачать файл', 'error');
        }
      }
      return;
    }

    const audioDownload = e.target.closest('[data-audio-download]');
    if (audioDownload) {
      e.preventDefault();
      const audioEl = audioDownload.closest('[data-audio-event]');
      const content = state.messageContent.get(audioEl?.dataset.audioEvent);
      if (content) {
        try {
          await downloadAttachment(content, content.body || 'audio');
        } catch {
          toast('Не удалось скачать аудио', 'error');
        }
      }
      return;
    }

    const lightboxImg = e.target.closest('[data-action="lightbox"]');
    if (lightboxImg) {
      openLightbox(lightboxImg.currentSrc || lightboxImg.dataset.src);
      return;
    }

    const jumpReply = e.target.closest('[data-action="jump-reply"]');
    if (jumpReply) {
      e.preventDefault();
      const escaped = window.CSS?.escape ? CSS.escape(jumpReply.dataset.event) : jumpReply.dataset.event;
      const target = document.querySelector(`.msg[data-event-id="${escaped}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('msg-highlight');
        setTimeout(() => target.classList.remove('msg-highlight'), 2000);
      }
      return;
    }

    const pollVote = e.target.closest('[data-poll-vote]');
    if (pollVote && !pollVote.disabled) {
      votePoll(pollVote.dataset.pollVote, pollVote.dataset.answer);
      return;
    }
    const pollEnd = e.target.closest('[data-poll-end]');
    if (pollEnd) {
      endPoll(pollEnd.dataset.pollEnd);
      return;
    }

    const reactionBtn = e.target.closest('[data-action="reaction-toggle"]');
    if (reactionBtn) {
      toggleReaction(
        reactionBtn.dataset.key,
        reactionBtn.closest('.msg')?.dataset.eventId,
        reactionBtn.dataset.event || null
      );
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (['reply', 'react', 'edit', 'delete', 'copy', 'bookmark', 'pin', 'thread'].includes(action)) {
      handleMessageAction(action, actionBtn.dataset.event, actionBtn);
    }
  });

  // Command palette
  $('#command-palette').addEventListener('click', (e) => {
    if (e.target.id === 'command-palette') closeCommandPalette();
  });
  $('#command-palette').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') trapFocus($('.command-panel'), e);
  });
  $('#command-input').addEventListener('input', (e) => renderCommands(e.target.value));
  $('#command-input').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { trapFocus($('.command-panel'), e); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveCommand(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveCommand(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); selectCommand(state.commandIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
  });
  $('#command-results').addEventListener('click', (e) => {
    const item = e.target.closest('[data-command-index]');
    if (item) selectCommand(Number(item.dataset.commandIndex));
  });

  // Bookmarks & recap
  $('#bookmarks-body').addEventListener('click', (e) => {
    const del = e.target.closest('[data-bookmark-delete]');
    if (del) {
      state.bookmarks = state.bookmarks.filter((b) => !(b.id === del.dataset.bookmarkDelete && b.roomId === del.dataset.bookmarkRoom));
      saveBookmarks();
      openBookmarks();
      return;
    }
    const jump = e.target.closest('[data-bookmark-jump]');
    if (jump) jumpToBookmark(jump.dataset.bookmarkJump, jump.dataset.bookmarkRoom);
  });
  $('#recap-body').addEventListener('click', (e) => {
    const room = e.target.closest('[data-recap-room]');
    if (!room) return;
    closeModals();
    selectRoom(room.dataset.recapRoom);
  });

  // Spaces
  $('#space-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-space-id]');
    if (item) openSpace(item.dataset.spaceId);
  });
  $('#space-body').addEventListener('click', (e) => {
    const join = e.target.closest('[data-space-join]');
    if (!join) return;
    const roomId = join.dataset.spaceJoin;
    const existing = state.demo ? state.demoRooms.find((r) => r.id === roomId) : state.client?.getRoom(roomId);
    const joined = state.demo ? !!existing : existing?.getMyMembership?.() === 'join';
    if (joined) {
      closeModals();
      selectRoom(roomId);
    } else {
      closeModals();
      joinDirectoryRoom(roomId);
    }
  });

  // Invites
  $('#invite-list').addEventListener('click', (e) => {
    const accept = e.target.closest('[data-invite-accept]');
    if (accept) {
      acceptInvite(accept.dataset.inviteAccept);
      return;
    }
    const decline = e.target.closest('[data-invite-decline]');
    if (decline) declineInvite(decline.dataset.inviteDecline);
  });

  // Directory
  $('#open-directory-from-join').addEventListener('click', () => {
    closeModals();
    openDirectory();
  });
  $('#directory-search-btn').addEventListener('click', () => searchDirectory($('#directory-search').value.trim()));
  $('#directory-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchDirectory(e.target.value.trim());
  });
  $('#directory-results').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-directory-join]');
    if (btn) joinDirectoryRoom(btn.dataset.directoryJoin);
  });

  // Global search
  $('#search-run').addEventListener('click', runGlobalSearch);
  $('#search-query').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runGlobalSearch();
  });
  $('#search-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-stab]');
    if (!btn) return;
    state.searchTab = btn.dataset.stab;
    $$('#search-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    if ($('#search-query').value.trim()) runGlobalSearch();
  });
  $('#search-results').addEventListener('click', async (e) => {
    const dm = e.target.closest('[data-user-dm]');
    if (dm) {
      closeModals();
      startDM(dm.dataset.userDm);
      return;
    }
    const roomBtn = e.target.closest('[data-search-room]');
    if (!roomBtn) return;
    const roomId = roomBtn.dataset.searchRoom;
    const existing = state.demo ? state.demoRooms.find((r) => r.id === roomId) : state.client?.getRoom(roomId);
    const joined = state.demo ? !!existing : existing?.getMyMembership?.() === 'join';
    if (joined) {
      closeModals();
      selectRoom(roomId);
    } else {
      closeModals();
      await joinDirectoryRoom(roomId);
    }
  });

  // Threads
  $('#thread-send').addEventListener('click', sendThreadReply);
  $('#thread-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendThreadReply();
    }
  });

  // Calls
  $('#call-voice-btn').addEventListener('click', () => startCall(false));
  $('#call-video-btn').addEventListener('click', () => startCall(true));
  $('#call-accept').addEventListener('click', answerCall);
  $('#call-decline').addEventListener('click', declineCall);
  $('#call-hangup').addEventListener('click', hangupCall);
  $('#call-mic').addEventListener('click', toggleCallMic);
  $('#call-cam').addEventListener('click', toggleCallCam);
  $('#call-backdrop').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') trapFocus($('#call-card'), e);
  });

  // E2EE
  $('#load-devices').addEventListener('click', loadMyDevices);
  $('#self-verify').addEventListener('click', beginSelfVerification);
  $('#restore-backup').addEventListener('click', restoreKeyBackup);
  $('#load-secret').addEventListener('click', loadSecretBackupKey);
  $('#retry-decrypt').addEventListener('click', retryDecryption);

  // Room settings
  $('#room-settings-save').addEventListener('click', saveRoomSettings);

  // Own avatar upload in settings
  $('#avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (state.demo) {
      const url = URL.createObjectURL(file);
      state.profile.avatarUrl = url;
      const myAvatar = $('#my-avatar');
      if (myAvatar) myAvatar.outerHTML = avatarHtml(state.profile.displayName, url, 'avatar-36').replace(
        '<span class="avatar avatar-36"', '<span id="my-avatar" class="avatar avatar-36"');
      const settingsAvatar = $('#settings-avatar');
      if (settingsAvatar) settingsAvatar.outerHTML = avatarHtml(state.profile.displayName, url, 'avatar-56').replace(
        '<span class="avatar avatar-56"', '<span id="settings-avatar" class="avatar avatar-56"');
      toast('Аватар обновлён (демо)', 'success');
      return;
    }
    try {
      const upload = await state.client.uploadContent(file, { name: 'avatar', type: file.type });
      const mxc = upload?.content_uri || upload;
      await state.client.setAvatarUrl(mxc);
      await refreshProfile();
      toast('Аватар обновлён', 'success');
    } catch (err) {
      toast(err?.message || 'Не удалось обновить аватар', 'error');
    }
  });

  // Modals
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModals();
    if (e.target.closest('[data-close-modal]')) closeModals();
  });

  // Settings
  $('#theme-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-value]');
    if (!btn) return;
    state.prefs.theme = btn.dataset.themeValue;
    applyTheme();
    savePrefs();
  });

  $('#accent-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accent-value]');
    if (!btn) return;
    state.prefs.accent = btn.dataset.accentValue;
    applyAccent();
    savePrefs();
  });

  $('#save-name-btn').addEventListener('click', async () => {
    const value = $('#display-name').value.trim();
    if (!value) return;
    if (state.demo) {
      state.profile.displayName = value;
      state.userId = state.userId || '@you:matrix.org';
      $('#my-name').textContent = value;
      $('#settings-name').textContent = value;
      const myAvatar = $('#my-avatar');
      if (myAvatar) myAvatar.outerHTML = avatarHtml(value, null, 'avatar-36').replace(
        '<span class="avatar avatar-36"',
        '<span id="my-avatar" class="avatar avatar-36"'
      );
      const settingsAvatar = $('#settings-avatar');
      if (settingsAvatar) settingsAvatar.outerHTML = avatarHtml(value, null, 'avatar-56').replace(
        '<span class="avatar avatar-56"',
        '<span id="settings-avatar" class="avatar avatar-56"'
      );
      toast('Имя сохранено (демо)', 'success', 1800);
      return;
    }
    try {
      await state.client.setDisplayName(value);
      state.profile.displayName = value;
      await refreshProfile();
      toast('Имя обновлено', 'success');
    } catch {
      toast('Не удалось обновить имя', 'error');
    }
  });

  $('#sound-toggle').addEventListener('change', (e) => {
    state.prefs.sound = e.target.checked;
    savePrefs();
    if (e.target.checked) playBeep();
  });

  $('#notify-toggle').addEventListener('change', async (e) => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        e.target.checked = false;
        toast('Уведомления не разрешены в браузере', 'error');
        state.prefs.notify = false;
        savePrefs();
        return;
      }
    }
    state.prefs.notify = e.target.checked;
    savePrefs();
  });

  // New room
  $('#new-room-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    $$('#new-room-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    ['create', 'join', 'dm'].forEach((tab) => {
      const panel = document.getElementById('tab-' + tab);
      if (panel) panel.classList.toggle('hidden', btn.dataset.tab !== tab);
    });
  });
  $('#create-room-submit').addEventListener('click', createRoom);
  $('#join-room-submit').addEventListener('click', joinRoom);
  $('#dm-submit').addEventListener('click', startDM);

  // Room leave (delegated)
  $('#room-info-body').addEventListener('click', async (e) => {
    if (e.target.closest('#open-room-settings')) {
      closeModals();
      openRoomSettings();
      return;
    }
    const member = e.target.closest('[data-member]');
    if (member && !e.target.closest('#invite-btn')) {
      openUserProfile(member.dataset.member);
      return;
    }
    const notif = e.target.closest('#room-notif-seg [data-notif]');
    if (notif) {
      setRoomNotifLevel(notif.dataset.notif);
      return;
    }
    const btn = e.target.closest('[data-leave-room]');
    if (btn) {
      leaveRoom(btn.dataset.leaveRoom);
      return;
    }
    if (e.target.closest('#invite-btn')) {
      const input = $('#invite-user');
      let userId = input?.value.trim() || '';
      if (!userId) return;
      if (!userId.startsWith('@')) userId = '@' + userId;
      const room = getCurrentRoom();
      if (!room) return;
      if (state.demo) {
        const name = userId.replace(/^@/, '').split(':')[0];
        room.members.push({ name, id: userId, power: 0 });
        openRoomInfo();
        toast('Пользователь приглашён (демо)', 'success');
        return;
      }
      try {
        await state.client.invite(room.roomId, userId);
        toast('Приглашение отправлено', 'success');
        openRoomInfo();
      } catch (err) {
        toast(err?.message || 'Не удалось пригласить пользователя', 'error');
      }
    }
  });

  // Demo link
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-demo-link]');
    if (link) {
      e.preventDefault();
      enterDemo();
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'system') applyTheme();
  });
}

function openLightbox(src) {
  if (!src) return;
  const box = $('#lightbox');
  const img = $('#lightbox-img');
  img.src = src;
  box.classList.remove('hidden');
}

function closeLightbox() {
  const box = $('#lightbox');
  if (!box || box.classList.contains('hidden')) return;
  box.classList.add('hidden');
  $('#lightbox-img').src = '';
}

/* ════════════════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════════════════ */
async function init() {
  document.body.classList.add('auth-mode');
  hydrateIcons();
  loadPrefs();
  loadUserData();

  // Extra elements must exist before event bindings are attached.
  const composerWrap = $('.composer-wrap');
  if (composerWrap) {
    const reply = document.createElement('div');
    reply.className = 'reply-banner hidden';
    reply.id = 'reply-banner';
    composerWrap.insertBefore(reply, composerWrap.firstChild);

    const filePreview = document.createElement('div');
    filePreview.className = 'file-preview';
    filePreview.id = 'file-preview';
    composerWrap.insertBefore(filePreview, composerWrap.querySelector('.composer'));

    initMentionPop();

    const voiceBar = document.createElement('div');
    voiceBar.className = 'voice-recording hidden';
    voiceBar.id = 'voice-recording';
    voiceBar.innerHTML = `
      <span class="voice-dot"></span>
      <span class="voice-timer" id="voice-timer">0:00</span>
      <span class="voice-label">Запись голосового…</span>
      <button class="btn btn-ghost btn-sm" id="voice-cancel" type="button">Отмена</button>
      <button class="btn btn-primary btn-sm" id="voice-send" type="button">Отправить</button>`;
    composerWrap.insertBefore(voiceBar, composerWrap.querySelector('.composer'));
  }

  if (!voiceSupported()) $('#voice-btn')?.classList.add('hidden');

  // The lightbox and emoji picker must not inherit the hidden modal backdrop.
  const lightbox = $('#lightbox');
  const emojiPop = $('#emoji-pop');
  if (lightbox) document.body.appendChild(lightbox);
  if (emojiPop) document.body.appendChild(emojiPop);

  bindEvents();

  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img?.tagName !== 'IMG') return;
    if ((img.dataset.mediaMxc || img.dataset.avatarMxc) && img.dataset.authTried !== '1') {
      img.dataset.authTried = '1';
      loadAuthenticatedMedia(img);
      return;
    }
    if (img.dataset.avatarFallback) {
      const fallback = img.dataset.avatarFallback;
      const parent = img.parentElement;
      if (parent) {
        img.remove();
        parent.textContent = fallback;
      }
      return;
    }
  }, true);

  // Demo link in auth footer
  const authFoot = $('.auth-foot');
  if (authFoot) {
    authFoot.insertAdjacentHTML('beforeend', ' · <a href="#demo" data-demo-link>Посмотреть демо</a>');
  }

  // Lightbox close
  $('.lightbox-close')?.addEventListener('click', closeLightbox);
  $('#lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  // Close emoji pop when clicking outside
  document.addEventListener('click', (e) => {
    const pop = $('#emoji-pop');
    if (!pop || pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || e.target.closest('#emoji-btn') || e.target.closest('[data-action="react"]')) return;
    pop.classList.add('hidden');
  });

  resizeComposer();
  updateSendButton();
  initDomainBanner();
  updateConnectionBanner();
  window.addEventListener('online', updateConnectionBanner);
  window.addEventListener('offline', updateConnectionBanner);
  syncSidebarA11y();

  if (await handleSsoCallback()) return;

  if (location.hash === '#demo') {
    enterDemo();
    return;
  }

  const session = readSession();
  if (session?.accessToken && session?.baseUrl && session?.userId) {
    await restoreSession(session);
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

init().catch((e) => {
  console.error(e);
  setAuthError('Не удалось запустить клиент. Обновите страницу.');
});

